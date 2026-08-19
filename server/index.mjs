/**
 * iDrive live ops server — REST + WebSocket.
 * Passenger, driver, and admin share one source of truth.
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  driverCard,
  hashPin,
  logEvent,
  now,
  publicUser,
  read,
  shapeOrder,
  tx,
  uid,
  verifyPin
} from './db.mjs';
import {
  docStatus,
  isKycSlot,
  parseImageDataUrl,
  readKycFile,
  saveKycFile
} from './kyc.mjs';

const PORT = Number(process.env.IDRIVE_PORT || 8787);
const ADMIN_PHONE = normalizePhone(process.env.IDRIVE_ADMIN_PHONE || '2000000000');
const ADMIN_PIN = process.env.IDRIVE_ADMIN_PIN || '1804';

await seedAdmin();

const clients = new Set();

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const body = await readBody(req);
    const session = getSession(req, url);
    const handled = await route(req.method, url.pathname, { req, res, url, body, session });
    if (!handled) json(res, 404, { error: 'ບໍ່ພົບເສັ້ນທາງ' });
  } catch (err) {
    const status = err.status || 500;
    json(res, status, { error: err.message || 'ຂໍ້ຜິດພາດລະບົບ' });
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const session = getSession(req, url);
  if (!session?.user) {
    ws.close(4401, 'auth');
    return;
  }
  ws.user = session.user;
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'hello', payload: snapshotFor(session.user) }));
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`iDrive live API  http://0.0.0.0:${PORT}`);
  console.log(`Admin login      +856 ${ADMIN_PHONE}  PIN ${ADMIN_PIN}`);
});

async function seedAdmin() {
  await tx((data) => {
    let admin = data.users.find((u) => u.phone === ADMIN_PHONE);
    if (!admin) {
      const pin = hashPin(ADMIN_PIN);
      admin = {
        id: uid('usr'),
        phone: ADMIN_PHONE,
        name: 'iDrive Admin',
        role: 'admin',
        pinSalt: pin.salt,
        pinHash: pin.hash,
        rating: 5,
        trips: 0,
        createdAt: now()
      };
      data.users.push(admin);
      logEvent(data, 'admin.seed', { userId: admin.id });
    } else {
      admin.role = 'admin';
    }
  });
}

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2_500_000) {
        const err = new Error('ຂໍ້ມູນໃຫຍ່ເກີນໄປ');
        err.status = 413;
        reject(err);
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(fail(400, 'JSON ບໍ່ຖືກ'));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req, url) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return url.searchParams.get('token') || '';
}

function getSession(req, url) {
  const token = bearer(req, url);
  if (!token) return null;
  const data = read();
  const session = data.sessions.find((s) => s.token === token && s.expiresAt > now());
  if (!session) return null;
  const user = data.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { token, user };
}

function requireUser(session) {
  if (!session?.user) fail(401, 'ກະລຸນາເຂົ້າສູ່ລະບົບ');
  return session.user;
}

function requireAdmin(session) {
  const user = requireUser(session);
  if (user.role !== 'admin') fail(403, 'ສຳລັບຜູ້ດູແລລະບົບເທົ່ານັ້ນ');
  return user;
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function match(path, pattern) {
  const keys = [];
  const re = new RegExp(
    `^${pattern.replace(/:([A-Za-z_]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    })}$`
  );
  const m = path.match(re);
  if (!m) return null;
  const params = {};
  keys.forEach((k, i) => {
    params[k] = decodeURIComponent(m[i + 1]);
  });
  return params;
}

async function route(method, path, ctx) {
  const { res, body, session } = ctx;

  if (method === 'GET' && path === '/api/health') {
    json(res, 200, { ok: true, service: 'idrive-live', at: now() });
    return true;
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const phone = normalizePhone(body.phone);
    const pin = String(body.pin || '').trim();
    const name = String(body.name || '').trim();
    if (phone.length < 8) fail(400, 'ເບີໂທບໍ່ຖືກ');
    if (!/^\d{4,6}$/.test(pin)) fail(400, 'ຕ້ອງໃສ່ລະຫັດ 4–6 ໂຕ');

    const result = await tx((data) => {
      let user = data.users.find((u) => u.phone === phone);
      if (!user) {
        const hashed = hashPin(pin);
        user = {
          id: uid('usr'),
          phone,
          name: name || `ຜູ້ໃຊ້ ${phone.slice(-4)}`,
          role: phone === ADMIN_PHONE ? 'admin' : 'passenger',
          pinSalt: hashed.salt,
          pinHash: hashed.hash,
          rating: 4.96,
          trips: 0,
          createdAt: now()
        };
        data.users.push(user);
        logEvent(data, 'user.register', { userId: user.id, phone });
      } else if (!verifyPin(pin, user.pinSalt, user.pinHash)) {
        fail(401, 'ລະຫັດບໍ່ຖືກ');
      } else if (name) {
        user.name = name;
      }

      data.sessions = data.sessions.filter((s) => s.expiresAt > now());
      const token = createHash('sha256').update(`${user.id}.${now()}.${Math.random()}`).digest('hex');
      data.sessions.push({
        token,
        userId: user.id,
        createdAt: now(),
        expiresAt: now() + 1000 * 60 * 60 * 24 * 30
      });
      return { token, user: publicUser(user), driver: driverFor(data, user.id) };
    });
    json(res, 200, result);
    return true;
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const token = session?.token;
    if (token) {
      await tx((data) => {
        data.sessions = data.sessions.filter((s) => s.token !== token);
      });
    }
    json(res, 200, { ok: true });
    return true;
  }

  if (method === 'GET' && path === '/api/me') {
    const user = requireUser(session);
    const data = read();
    json(res, 200, {
      user: publicUser(user),
      driver: driverFor(data, user.id),
      snapshot: snapshotFor(user)
    });
    return true;
  }

  if (method === 'GET' && path === '/api/snapshot') {
    const user = requireUser(session);
    json(res, 200, snapshotFor(user));
    return true;
  }

  if (method === 'POST' && path === '/api/driver/docs') {
    const user = requireUser(session);
    const slot = String(body.slot || '');
    if (!isKycSlot(slot)) fail(400, 'ປະເພດເອກະສານບໍ່ຖືກ');
    const buf = parseImageDataUrl(body.image);
    if (!buf) fail(400, 'ຮູບບໍ່ຖືກ ຫຼື ໃຫຍ່ເກີນໄປ');
    saveKycFile(user.id, slot, buf);
    const driver = await tx((data) => {
      let d = data.drivers.find((x) => x.userId === user.id);
      if (!d) {
        d = {
          userId: user.id,
          status: 'draft',
          name: user.name,
          phone: user.phone,
          docs: {},
          rating: 4.95,
          trips: 0,
          earnings: 0,
          online: false
        };
        data.drivers.push(d);
      }
      d.docs = { ...(d.docs || {}), [slot]: { at: now(), mime: 'image/jpeg' } };
      d.docStatus = docStatus(d);
      return driverCard(d, data.users.find((u) => u.id === user.id), { kyc: true });
    });
    json(res, 200, { driver, slot });
    return true;
  }

  const docGet = match(path, '/api/driver/docs/:userId/:slot');
  if (method === 'GET' && docGet) {
    requireUser(session);
    if (session.user.role !== 'admin' && session.user.id !== docGet.userId) {
      fail(403, 'ເບິ່ງເອກະສານນີ້ບໍ່ໄດ້');
    }
    if (!isKycSlot(docGet.slot)) fail(400, 'ປະເພດເອກະສານບໍ່ຖືກ');
    const file = readKycFile(docGet.userId, docGet.slot);
    if (!file) fail(404, 'ບໍ່ພົບຮູບ');
    res.writeHead(200, {
      'Content-Type': file.mime,
      'Cache-Control': 'private, max-age=30'
    });
    res.end(file.buf);
    return true;
  }

  if (method === 'POST' && path === '/api/driver/apply') {
    const user = requireUser(session);
    const driver = await tx((data) => {
      const existing = data.drivers.find((d) => d.userId === user.id);
      const docs = existing?.docs || {};
      const next = {
        userId: user.id,
        status: existing?.status === 'approved' ? 'approved' : 'pending',
        name: body.name || user.name,
        phone: body.phone || user.phone,
        city: body.city || 'ວຽງຈັນ',
        idType: body.idType === 'passport' ? 'passport' : 'idcard',
        idNumber: String(body.idNumber || existing?.idNumber || '').trim(),
        licenseNumber: String(body.licenseNumber || existing?.licenseNumber || '').trim(),
        vehicleType: body.vehicleType || 'ride',
        brand: body.brand || '',
        model: body.model || '',
        color: body.color || '',
        plate: body.plate || '',
        year: body.year || '',
        docs,
        rating: existing?.rating || 4.95,
        trips: existing?.trips || 0,
        earnings: existing?.earnings || 0,
        online: false,
        submittedAt: now(),
        rejectReason: existing?.status === 'approved' ? '' : existing?.rejectReason || '',
        approvedAt: existing?.status === 'approved' ? existing.approvedAt : null
      };
      next.docStatus = docStatus(next);
      if (existing) Object.assign(existing, next);
      else data.drivers.push(next);
      const u = data.users.find((x) => x.id === user.id);
      if (u) {
        if (body.name) u.name = body.name;
        if (body.phone) u.phone = normalizePhone(body.phone);
      }
      logEvent(data, 'driver.apply', { userId: user.id, status: next.status });
      return driverCard(existing || next, u, { kyc: true });
    });
    broadcast({ type: 'driver', payload: driver });
    json(res, 200, { driver });
    return true;
  }

  if (method === 'POST' && path === '/api/driver/online') {
    const user = requireUser(session);
    const driver = await tx((data) => {
      const d = data.drivers.find((x) => x.userId === user.id);
      if (!d || d.status !== 'approved') fail(403, 'ບັນຊີຄົນຂັບຍັງບໍ່ຖືກອະນຸມັດ');
      d.online = !!body.online;
      if (body.lat != null) d.lat = Number(body.lat);
      if (body.lng != null) d.lng = Number(body.lng);
      d.lastSeen = now();
      return driverCard(d, data.users.find((u) => u.id === user.id));
    });
    broadcast({ type: 'driver', payload: driver });
    json(res, 200, { driver });
    return true;
  }

  if (method === 'POST' && path === '/api/driver/location') {
    const user = requireUser(session);
    const driver = await tx((data) => {
      const d = data.drivers.find((x) => x.userId === user.id);
      if (!d) fail(404, 'ບໍ່ພົບໂປຣໄຟລ໌ຄົນຂັບ');
      d.lat = Number(body.lat);
      d.lng = Number(body.lng);
      d.lastSeen = now();
      return driverCard(d, data.users.find((u) => u.id === user.id));
    });
    broadcast({ type: 'location', payload: driver });
    json(res, 200, { ok: true });
    return true;
  }

  if (method === 'GET' && path === '/api/orders') {
    requireUser(session);
    const data = read();
    json(res, 200, { orders: data.orders.map((o) => shapeOrder(o, data)) });
    return true;
  }

  if (method === 'POST' && path === '/api/orders') {
    const user = requireUser(session);
    const order = await tx((data) => {
      if (!body.pickup || !body.dest) fail(400, 'ຕ້ອງມີຈຸດຮັບ ແລະ ປາຍທາງ');
      const created = {
        id: uid('ord'),
        status: 'open',
        createdAt: now(),
        passengerId: user.id,
        passengerName: user.name,
        pickup: body.pickup,
        dest: body.dest,
        offerFare: Number(body.fare || body.offerFare || 0),
        vehicle: body.vehicle || 'ride',
        payment: body.payment || 'ເງິນສົດ',
        note: body.note || '',
        distance: body.distance || null,
        duration: body.duration || null,
        bids: [],
        acceptedBidId: null,
        phase: null,
        driverId: null,
        finalFare: null
      };
      data.orders.unshift(created);
      logEvent(data, 'order.create', { orderId: created.id, userId: user.id });
      return shapeOrder(created, data);
    });
    broadcast({ type: 'order', payload: order });
    json(res, 200, { order });
    return true;
  }

  const cancel = match(path, '/api/orders/:id/cancel');
  if (method === 'POST' && cancel) {
    const user = requireUser(session);
    const order = await mutateOrder(cancel.id, (o) => {
      if (o.passengerId !== user.id && user.role !== 'admin') fail(403, 'ຍົກເລີກບໍ່ໄດ້');
      if (!['open', 'bidding'].includes(o.status)) fail(400, 'ຍົກເລີກບໍ່ໄດ້ໃນສະຖານະນີ້');
      o.status = 'cancelled';
      o.cancelledAt = now();
    });
    json(res, 200, { order });
    return true;
  }

  const bidPath = match(path, '/api/orders/:id/bids');
  if (method === 'POST' && bidPath) {
    const user = requireUser(session);
    const order = await mutateOrder(bidPath.id, (o, data) => {
      const d = data.drivers.find((x) => x.userId === user.id);
      if (!d || d.status !== 'approved') fail(403, 'ຕ້ອງເປັນຄົນຂັບທີ່ອະນຸມັດແລ້ວ');
      if (!['open', 'bidding'].includes(o.status)) fail(400, 'ງານນີ້ປິດຮັບຂໍ້ສະເໜີແລ້ວ');
      o.status = 'bidding';
      const bid = {
        driverId: user.id,
        price: Number(body.price),
        type: body.type || 'counter',
        at: now(),
        eta: body.eta
      };
      const idx = o.bids.findIndex((b) => b.driverId === user.id);
      if (idx >= 0) o.bids[idx] = bid;
      else o.bids.push(bid);
      o.bids.sort((a, b) => a.price - b.price);
    });
    json(res, 200, { order });
    return true;
  }

  const acceptPath = match(path, '/api/orders/:id/accept');
  if (method === 'POST' && acceptPath) {
    const user = requireUser(session);
    const order = await mutateOrder(acceptPath.id, (o) => {
      if (o.passengerId !== user.id) fail(403, 'ຮັບຂໍ້ສະເໜີບໍ່ໄດ້');
      const driverId = body.driverId;
      const bid = o.bids.find((b) => b.driverId === driverId);
      if (!bid) fail(404, 'ບໍ່ພົບຂໍ້ສະເໜີ');
      o.status = 'matched';
      o.acceptedBidId = driverId;
      o.driverId = driverId;
      o.phase = 'to_pickup';
      o.finalFare = bid.price;
    });
    json(res, 200, { order });
    return true;
  }

  const takePath = match(path, '/api/orders/:id/take');
  if (method === 'POST' && takePath) {
    const user = requireUser(session);
    const order = await mutateOrder(takePath.id, (o, data) => {
      const d = data.drivers.find((x) => x.userId === user.id);
      if (!d || d.status !== 'approved') fail(403, 'ຍັງບໍ່ຖືກອະນຸມັດເປັນຄົນຂັບ');
      if (!['open', 'bidding'].includes(o.status)) fail(400, 'ງານນີ້ຖືກຮັບໄປແລ້ວ');
      const bid = {
        driverId: user.id,
        price: o.offerFare,
        type: 'accept',
        at: now()
      };
      const idx = o.bids.findIndex((b) => b.driverId === user.id);
      if (idx >= 0) o.bids[idx] = bid;
      else o.bids.push(bid);
      o.status = 'matched';
      o.acceptedBidId = user.id;
      o.driverId = user.id;
      o.phase = 'to_pickup';
      o.finalFare = o.offerFare;
    });
    json(res, 200, { order });
    return true;
  }

  const phasePath = match(path, '/api/orders/:id/phase');
  if (method === 'POST' && phasePath) {
    const user = requireUser(session);
    const order = await mutateOrder(phasePath.id, (o) => {
      if (o.driverId !== user.id && o.passengerId !== user.id && user.role !== 'admin') {
        fail(403, 'ປ່ຽນໄລຍະບໍ່ໄດ້');
      }
      o.phase = body.phase;
    });
    json(res, 200, { order });
    return true;
  }

  const completePath = match(path, '/api/orders/:id/complete');
  if (method === 'POST' && completePath) {
    const user = requireUser(session);
    const order = await mutateOrder(completePath.id, (o, data) => {
      if (o.passengerId !== user.id && o.driverId !== user.id && user.role !== 'admin') {
        fail(403, 'ຈົບທ່ຽວບໍ່ໄດ້');
      }
      o.status = 'completed';
      o.phase = 'done';
      o.rating = Number(body.rating || 5);
      o.review = body.review || '';
      o.completedAt = now();
      const fare = o.finalFare || o.offerFare;
      const passenger = data.users.find((u) => u.id === o.passengerId);
      const driverUser = data.users.find((u) => u.id === o.driverId);
      const driver = data.drivers.find((d) => d.userId === o.driverId);
      if (passenger) passenger.trips = (passenger.trips || 0) + 1;
      if (driverUser) driverUser.trips = (driverUser.trips || 0) + 1;
      if (driver) {
        driver.trips = (driver.trips || 0) + 1;
        driver.earnings = (driver.earnings || 0) + fare;
        const prev = Number(driver.rating || 4.95);
        driver.rating = Number(
          ((prev * Math.max(1, driver.trips - 1) + o.rating) / driver.trips).toFixed(2)
        );
      }
    });
    json(res, 200, { order });
    return true;
  }

  const chatGet = match(path, '/api/orders/:id/chat');
  if (method === 'GET' && chatGet) {
    requireUser(session);
    const data = read();
    json(res, 200, {
      messages: data.messages.filter((m) => m.orderId === chatGet.id)
    });
    return true;
  }

  if (method === 'POST' && chatGet) {
    const user = requireUser(session);
    const text = String(body.text || '').trim();
    if (!text) fail(400, 'ຂໍ້ຄວາມວ່າງ');
    const message = await tx((data) => {
      const o = data.orders.find((x) => x.id === chatGet.id);
      if (!o) fail(404, 'ບໍ່ພົບງານ');
      if (o.passengerId !== user.id && o.driverId !== user.id && user.role !== 'admin') {
        fail(403, 'ສົ່ງແຊັດບໍ່ໄດ້');
      }
      const msg = {
        id: uid('msg'),
        orderId: o.id,
        userId: user.id,
        name: user.name,
        text,
        at: now()
      };
      data.messages.push(msg);
      return msg;
    });
    broadcast({ type: 'chat', payload: message });
    json(res, 200, { message });
    return true;
  }

  if (method === 'GET' && path === '/api/admin/overview') {
    requireAdmin(session);
    const data = read();
    json(res, 200, adminOverview(data));
    return true;
  }

  const approve = match(path, '/api/admin/drivers/:id/approve');
  if (method === 'POST' && approve) {
    requireAdmin(session);
    const driver = await tx((data) => {
      const d = data.drivers.find((x) => x.userId === approve.id);
      if (!d) fail(404, 'ບໍ່ພົບຄົນຂັບ');
      d.status = body.reject ? 'rejected' : 'approved';
      d.approvedAt = body.reject ? null : now();
      d.rejectReason = body.reject ? String(body.note || '').slice(0, 400) : '';
      logEvent(data, body.reject ? 'driver.reject' : 'driver.approve', { userId: d.userId });
      return driverCard(d, data.users.find((u) => u.id === d.userId), { kyc: true });
    });
    broadcast({ type: 'driver', payload: driver });
    json(res, 200, { driver });
    return true;
  }

  const adminCancel = match(path, '/api/admin/orders/:id/cancel');
  if (method === 'POST' && adminCancel) {
    requireAdmin(session);
    const order = await mutateOrder(adminCancel.id, (o) => {
      if (o.status === 'completed') fail(400, 'ທ່ຽວນີ້ສຳເລັດແລ້ວ');
      o.status = 'cancelled';
      o.cancelledAt = now();
      o.phase = null;
    });
    json(res, 200, { order });
    return true;
  }

  return false;
}

function driverFor(data, userId) {
  const d = data.drivers.find((x) => x.userId === userId);
  const u = data.users.find((x) => x.id === userId);
  return driverCard(d, u, { kyc: true });
}

function snapshotFor(user) {
  const data = read();
  return {
    me: publicUser(user),
    driver: driverFor(data, user.id),
    orders: data.orders.map((o) => shapeOrder(o, data)),
    drivers: data.drivers
      .filter((d) => d.status === 'approved' && d.online && d.lastSeen > now() - 1000 * 90)
      .map((d) => driverCard(d, data.users.find((u) => u.id === d.userId))),
    messages: data.messages.slice(-200)
  };
}

function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fareOf(o) {
  return Number(o.finalFare || o.offerFare || 0);
}

function adminOverview(data) {
  const t = now();
  const today0 = dayStart(t);
  const yest0 = today0 - 86400000;
  const week0 = today0 - 6 * 86400000;
  const onlineCut = t - 1000 * 90;
  const waitCut = t - 5 * 60 * 1000;

  const completed = data.orders.filter((o) => o.status === 'completed');
  const cancelled = data.orders.filter((o) => o.status === 'cancelled');
  const doneAt = (o) => o.completedAt || o.cancelledAt || o.createdAt;
  const todayDone = completed.filter((o) => doneAt(o) >= today0);
  const yestDone = completed.filter((o) => doneAt(o) >= yest0 && doneAt(o) < today0);
  const weekDone = completed.filter((o) => doneAt(o) >= week0);

  const revenue = completed.reduce((sum, o) => sum + fareOf(o), 0);
  const todayRevenue = todayDone.reduce((sum, o) => sum + fareOf(o), 0);
  const yesterdayRevenue = yestDone.reduce((sum, o) => sum + fareOf(o), 0);
  const weekRevenue = weekDone.reduce((sum, o) => sum + fareOf(o), 0);

  const ratings = completed.map((o) => Number(o.rating)).filter((n) => n > 0);
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
    : 0;
  const closed = completed.length + cancelled.length;
  const distances = data.orders.map((o) => Number(o.distance)).filter((n) => n > 0);

  const vehicleMix = { ride: 0, moto: 0, comfort: 0, suv: 0 };
  const paymentMix = {};
  for (const o of data.orders) {
    if (vehicleMix[o.vehicle] != null) vehicleMix[o.vehicle] += 1;
    const pay = o.payment || 'ເງິນສົດ';
    paymentMix[pay] = (paymentMix[pay] || 0) + 1;
  }

  const hours = Array.from({ length: 12 }, (_, i) => {
    const start = t - (12 - i) * 3600000;
    const end = start + 3600000;
    return {
      h: new Date(start).getHours(),
      n: data.orders.filter((o) => o.createdAt >= start && o.createdAt < end).length
    };
  });

  return {
    updatedAt: t,
    stats: {
      users: data.users.filter((u) => u.role !== 'admin').length,
      drivers: data.drivers.filter((d) => d.status === 'approved').length,
      pendingDrivers: data.drivers.filter((d) => d.status === 'pending').length,
      onlineDrivers: data.drivers.filter(
        (d) => d.status === 'approved' && d.online && d.lastSeen > onlineCut
      ).length,
      liveTrips: data.orders.filter((o) => o.status === 'matched').length,
      openJobs: data.orders.filter((o) => ['open', 'bidding'].includes(o.status)).length,
      bidding: data.orders.filter((o) => o.status === 'bidding').length,
      completed: completed.length,
      cancelled: cancelled.length,
      revenue,
      todayRevenue,
      yesterdayRevenue,
      weekRevenue,
      todayTrips: todayDone.length,
      yesterdayTrips: yestDone.length,
      weekTrips: weekDone.length,
      avgFare: completed.length ? Math.round(revenue / completed.length) : 0,
      avgRating,
      ratingCount: ratings.length,
      completionRate: closed ? Math.round((completed.length / closed) * 100) : 0,
      avgKm: distances.length
        ? Math.round((distances.reduce((a, b) => a + b, 0) / distances.length) * 10) / 10
        : 0,
      vehicleMix,
      paymentMix,
      hours,
      waitingLong: data.orders.filter(
        (o) => ['open', 'bidding'].includes(o.status) && o.createdAt < waitCut
      ).length
    },
    orders: data.orders.slice(0, 200).map((o) => shapeOrder(o, data)),
    drivers: data.drivers.map((d) => driverCard(d, data.users.find((u) => u.id === d.userId), { kyc: true })),
    users: data.users.map(publicUser),
    events: data.events.slice(0, 80)
  };
}

async function mutateOrder(id, mutator) {
  const order = await tx((data) => {
    const o = data.orders.find((x) => x.id === id);
    if (!o) fail(404, 'ບໍ່ພົບງານ');
    mutator(o, data);
    logEvent(data, 'order.update', { orderId: o.id, status: o.status, phase: o.phase });
    return shapeOrder(o, data);
  });
  broadcast({ type: 'order', payload: order });
  return order;
}

function broadcast(event) {
  const raw = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(raw);
  }
}

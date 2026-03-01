const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const { readDb, writeDb } = require('./store');

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createTripCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function sortTripCollections(trip) {
  trip.itineraryItems.sort((a, b) => {
    const aKey = `${a.date || ''} ${a.startTime || ''}`;
    const bKey = `${b.date || ''} ${b.startTime || ''}`;
    return aKey.localeCompare(bKey);
  });

  trip.guideSections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  trip.memories.sort((a, b) => {
    const aKey = `${a.date || ''} ${a.createdAt || ''}`;
    const bKey = `${b.date || ''} ${b.createdAt || ''}`;
    return aKey.localeCompare(bKey);
  });
}

function findTrip(db, tripId) {
  return db.trips.find((trip) => trip.id === tripId);
}

function createApp({ emitTripUpdated = () => {} } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  function updateTrip(tripId, updater) {
    const db = readDb();
    const tripIndex = db.trips.findIndex((trip) => trip.id === tripId);

    if (tripIndex === -1) {
      return { error: '旅行が見つかりません。', status: 404 };
    }

    const trip = db.trips[tripIndex];
    const result = updater(trip);
    if (result?.error) {
      return result;
    }

    sortTripCollections(trip);
    db.trips[tripIndex] = trip;
    writeDb(db);
    emitTripUpdated(trip);

    return { trip };
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/trips', (req, res) => {
    const { name, destination, startDate, endDate, memberName } = req.body || {};

    if (!name || !destination || !memberName) {
      return res.status(400).json({ error: '旅行名・目的地・参加者名は必須です。' });
    }

    const db = readDb();

    let code = createTripCode();
    while (db.trips.some((trip) => trip.code === code)) {
      code = createTripCode();
    }

    const member = {
      id: createId('member'),
      name: memberName,
      joinedAt: new Date().toISOString(),
    };

    const trip = {
      id: createId('trip'),
      code,
      name,
      destination,
      startDate: startDate || '',
      endDate: endDate || '',
      createdAt: new Date().toISOString(),
      members: [member],
      itineraryItems: [],
      guideSections: [
        {
          id: createId('guide'),
          title: '旅の概要',
          content: `${destination} への旅行計画です。集合時間や移動手段をここにまとめましょう。`,
          order: 1,
        },
        {
          id: createId('guide'),
          title: '持ち物チェック',
          content: '- パスポート / 身分証\n- 充電器\n- 保険証\n- 常備薬',
          order: 2,
        },
        {
          id: createId('guide'),
          title: '緊急連絡先',
          content: '家族・宿泊先・保険会社の連絡先を記載。',
          order: 3,
        },
      ],
      memories: [],
    };

    db.trips.push(trip);
    writeDb(db);

    return res.status(201).json({ trip, member });
  });

  app.post('/api/trips/join', (req, res) => {
    const { code, memberName } = req.body || {};

    if (!code || !memberName) {
      return res.status(400).json({ error: '招待コードと参加者名は必須です。' });
    }

    const db = readDb();
    const trip = db.trips.find((entry) => entry.code === String(code).trim().toUpperCase());
    if (!trip) {
      return res.status(404).json({ error: '招待コードに一致する旅行がありません。' });
    }

    let member = trip.members.find(
      (entry) => entry.name.trim().toLowerCase() === String(memberName).trim().toLowerCase(),
    );

    if (!member) {
      member = {
        id: createId('member'),
        name: memberName,
        joinedAt: new Date().toISOString(),
      };
      trip.members.push(member);
      writeDb(db);
      emitTripUpdated(trip);
    }

    return res.json({ trip, member });
  });

  app.get('/api/trips/:tripId', (req, res) => {
    const db = readDb();
    const trip = findTrip(db, req.params.tripId);
    if (!trip) {
      return res.status(404).json({ error: '旅行が見つかりません。' });
    }
    return res.json({ trip });
  });

  app.post('/api/trips/:tripId/itinerary', (req, res) => {
    const { date, startTime, endTime, title, place, notes, ownerMemberId } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: '予定タイトルは必須です。' });
    }

    const result = updateTrip(req.params.tripId, (trip) => {
      trip.itineraryItems.push({
        id: createId('item'),
        date: date || '',
        startTime: startTime || '',
        endTime: endTime || '',
        title,
        place: place || '',
        notes: notes || '',
        ownerMemberId: ownerMemberId || '',
        createdAt: new Date().toISOString(),
      });
      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(201).json(result);
  });

  app.put('/api/trips/:tripId/itinerary/:itemId', (req, res) => {
    const payload = req.body || {};

    const result = updateTrip(req.params.tripId, (trip) => {
      const item = trip.itineraryItems.find((entry) => entry.id === req.params.itemId);
      if (!item) {
        return { error: '対象の予定が見つかりません。', status: 404 };
      }

      item.date = payload.date ?? item.date;
      item.startTime = payload.startTime ?? item.startTime;
      item.endTime = payload.endTime ?? item.endTime;
      item.title = payload.title ?? item.title;
      item.place = payload.place ?? item.place;
      item.notes = payload.notes ?? item.notes;
      item.ownerMemberId = payload.ownerMemberId ?? item.ownerMemberId;

      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  });

  app.delete('/api/trips/:tripId/itinerary/:itemId', (req, res) => {
    const result = updateTrip(req.params.tripId, (trip) => {
      const initialLength = trip.itineraryItems.length;
      trip.itineraryItems = trip.itineraryItems.filter((entry) => entry.id !== req.params.itemId);

      if (trip.itineraryItems.length === initialLength) {
        return { error: '対象の予定が見つかりません。', status: 404 };
      }

      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  });

  app.post('/api/trips/:tripId/guide', (req, res) => {
    const { title, content, order } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: '見出しは必須です。' });
    }

    const result = updateTrip(req.params.tripId, (trip) => {
      trip.guideSections.push({
        id: createId('guide'),
        title,
        content: content || '',
        order: typeof order === 'number' ? order : trip.guideSections.length + 1,
        updatedAt: new Date().toISOString(),
      });
      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(201).json(result);
  });

  app.put('/api/trips/:tripId/guide/:sectionId', (req, res) => {
    const payload = req.body || {};

    const result = updateTrip(req.params.tripId, (trip) => {
      const section = trip.guideSections.find((entry) => entry.id === req.params.sectionId);
      if (!section) {
        return { error: '対象のしおりセクションが見つかりません。', status: 404 };
      }

      section.title = payload.title ?? section.title;
      section.content = payload.content ?? section.content;
      section.order = payload.order ?? section.order;
      section.updatedAt = new Date().toISOString();

      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  });

  app.delete('/api/trips/:tripId/guide/:sectionId', (req, res) => {
    const result = updateTrip(req.params.tripId, (trip) => {
      const initialLength = trip.guideSections.length;
      trip.guideSections = trip.guideSections.filter((entry) => entry.id !== req.params.sectionId);

      if (trip.guideSections.length === initialLength) {
        return { error: '対象のしおりセクションが見つかりません。', status: 404 };
      }

      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  });

  app.post('/api/trips/:tripId/memories', (req, res) => {
    const { date, title, content, photos, authorMemberId } = req.body || {};

    if (!title || !content) {
      return res.status(400).json({ error: '思い出タイトルと本文は必須です。' });
    }

    const normalizedPhotos = Array.isArray(photos)
      ? photos
          .map((entry) => String(entry).trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const result = updateTrip(req.params.tripId, (trip) => {
      trip.memories.push({
        id: createId('memory'),
        date: date || '',
        title,
        content,
        photos: normalizedPhotos,
        authorMemberId: authorMemberId || '',
        createdAt: new Date().toISOString(),
      });
      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(201).json(result);
  });

  app.put('/api/trips/:tripId/memories/:memoryId', (req, res) => {
    const payload = req.body || {};

    const result = updateTrip(req.params.tripId, (trip) => {
      const memory = trip.memories.find((entry) => entry.id === req.params.memoryId);
      if (!memory) {
        return { error: '対象の思い出が見つかりません。', status: 404 };
      }

      memory.date = payload.date ?? memory.date;
      memory.title = payload.title ?? memory.title;
      memory.content = payload.content ?? memory.content;
      memory.photos = Array.isArray(payload.photos)
        ? payload.photos.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 3)
        : memory.photos;
      memory.authorMemberId = payload.authorMemberId ?? memory.authorMemberId;
      memory.updatedAt = new Date().toISOString();

      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  });

  app.delete('/api/trips/:tripId/memories/:memoryId', (req, res) => {
    const result = updateTrip(req.params.tripId, (trip) => {
      const initialLength = trip.memories.length;
      trip.memories = trip.memories.filter((entry) => entry.id !== req.params.memoryId);

      if (trip.memories.length === initialLength) {
        return { error: '対象の思い出が見つかりません。', status: 404 };
      }

      return null;
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  });

  return app;
}

module.exports = {
  createApp,
};

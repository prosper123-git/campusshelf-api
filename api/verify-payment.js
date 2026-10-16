const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
const db = admin.firestore();

// Server-side source of truth for prices.
// Keep this in sync with books_data.js whenever you change a price.
const PRICES = {
  'CSC 201': 100, 'SEN 201': 200, 'COS 209': 3000, 'BUS 304': 4700,
  'MAC 201': 3800, 'PHE 202': 5000, 'LAW 101': 6000, 'BCH 201': 4200,
  'ECO 105': 2800, 'ACC 306': 5900, 'PHY 102': 3500, 'GST 203': 2500,
};

// Only these websites may call this API.
const ALLOWED_ORIGINS = [
  'https://bushelf.web.app',
  'https://bushelf.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // 1. Who is asking? Verify the Firebase login token.
    const idToken = (req.headers.authorization || '').replace('Bearer ', '');
    const { uid } = await admin.auth().verifyIdToken(idToken);

    // 2. Which payment?
    const { reference } = req.body || {};
    if (!reference) return res.status(400).json({ error: 'Missing reference' });

    // 3. Ask Paystack directly whether it succeeded.
    const r = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const body = await r.json();
    const tx = body.data;

    // 4. Check everything that matters.
    const code = tx && tx.metadata && tx.metadata.courseCode;
    if (
      !body.status ||
      tx.status !== 'success' ||
      tx.currency !== 'NGN' ||
      !PRICES[code] ||
      tx.amount !== PRICES[code] * 100 ||
      tx.metadata.uid !== uid
    ) {
      return res.status(400).json({ error: 'Payment could not be verified' });
    }

    // 5. Record it, and make sure a reference can't be reused by someone else.
    const paymentRef = db.collection('payments').doc(reference);
    const purchaseRef = db.doc(`users/${uid}/purchases/${code}`);

    await db.runTransaction(async (t) => {
      const existing = await t.get(paymentRef);
      if (existing.exists && existing.data().uid !== uid) {
        throw new Error('Reference already used');
      }
      t.set(paymentRef, { uid, courseCode: code, amount: tx.amount, createdAt: new Date() });
      t.set(purchaseRef, { reference, purchasedAt: new Date() });
    });

    return res.json({ ok: true, courseCode: code });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: 'Verification failed' });
  }
};
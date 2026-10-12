   const admin = require('firebase-admin');
   const serviceAccount = require('./serviceAccountKey.json');

   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

   const email = process.argv[2];

   admin.auth().getUserByEmail(email)
     .then(user => admin.auth().setCustomUserClaims(user.uid, { admin: true }))
     .then(() => { console.log(email + ' is now an admin.'); process.exit(0); })
     .catch(err => { console.error(err); process.exit(1); });
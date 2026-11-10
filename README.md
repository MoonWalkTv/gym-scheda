# Scheda Palestra

Sito della scheda palestra su **https://gym.prismaptgi.com** (GitHub Pages).

- Accesso con email/password o Google (Firebase Authentication, progetto `scheda-palestra-83ffa`).
- Ogni account ha le sue schede, pesi per serie, storico allenamenti (Cloud Firestore, `users/{uid}` + `users/{uid}/sessions`).
- Regole del database in `firestore.rules`: ognuno legge e scrive solo i propri dati.
- Accesso con Apple: pronto nel codice ma spento (`appleSignIn` in `firebase-config.js`); serve un account Apple Developer
  per configurare il provider Apple in Firebase.

File: `index.html`, `style.css`, `app.js` (logica), `template.js` (scheda di esempio), `firebase-config.js`.
Nessuna build: si modifica e si fa push su `main`.

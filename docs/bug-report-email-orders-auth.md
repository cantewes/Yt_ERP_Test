# Bug Report: Email-Orders Admin-Authentifizierung

**Datum:** 01.12.2025
**Projekt:** ERP-Demo
**Modul:** Email-Orders (Phase 11b)
**Schweregrad:** Mittel (Feature blockiert, Workaround vorhanden)

---

## Symptom

Benutzer mit Admin-Rolle sehen "Fehler: Admin access required" auf der Email-Orders Seite, obwohl sie korrekt eingeloggt sind (Admin-Badge sichtbar in Navigation).

---

## Root Cause Analyse

### Primaeres Problem: Veralteter Server-Code im Speicher

Die Backend-Route `backend/routes/emailOrders.js` wurde geaendert:

**Vorher (alt):**
```javascript
const requireAdmin = (req, res, next) => {
  const userRole = req.headers['x-user-role'];
  if (userRole !== 'admin' && userRole !== 'manager') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};
```

**Nachher (neu):**
```javascript
const { authMiddleware, requireRole } = require('../middleware/auth');
router.use(authMiddleware);
router.use(requireRole('admin', 'manager'));
```

**Beweis:** Die Fehlermeldung "Admin access required" stammt aus der alten Middleware. Die neue `requireRole` Middleware gibt "Insufficient permissions" zurueck.

### Sekundaeres Problem: Prozess-Management

Waehrend der Entwicklung wurden 24+ Node.js-Prozesse gestartet, ohne die vorherigen zu beenden:
- Unklarheit ueber den aktiven Server
- Race Conditions beim Port-Binding
- Inkonsistentes Verhalten durch alte Prozesse

---

## Sofort-Loesung

```bash
# 1. Alle Node-Prozesse beenden (Windows)
taskkill /F /IM node.exe

# 2. Server neu starten
cd backend && npm start

# 3. Browser Hard-Reload
Strg+Shift+R
```

---

## Empfohlene strukturelle Verbesserungen

### 1. Nodemon fuer Development (Prioritaet: HOCH)

**Warum:** Automatische Neustarts bei Code-Aenderungen verhindern das Problem dauerhaft.

```bash
cd backend
npm install --save-dev nodemon
```

**package.json:**
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

**Neuer Workflow:**
1. Ein Terminal oeffnen
2. `npm run dev` starten
3. Bei Code-Aenderungen: Automatischer Restart
4. Zum Beenden: `Ctrl+C`

### 2. Port-Check vor Server-Start (Prioritaet: MITTEL)

**server.js erweitern:**
```javascript
const net = require('net');
const PORT = 3000;

const testServer = net.createServer();
testServer.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} bereits belegt!`);
    console.error('Loesung: taskkill /F /IM node.exe');
    process.exit(1);
  }
});
testServer.once('listening', () => {
  testServer.close();
  startExpressServer();
});
testServer.listen(PORT);
```

### 3. Graceful Shutdown (Prioritaet: MITTEL)

```javascript
process.on('SIGINT', () => {
  console.log('Server wird beendet...');
  server.close(() => process.exit(0));
});
```

---

## Betroffene Dateien

| Datei | Status |
|-------|--------|
| `backend/routes/emailOrders.js` | Code korrekt, Server-Neustart erforderlich |
| `frontend/email-orders.html` | Code korrekt |
| `backend/package.json` | Nodemon + dev-Script hinzugefuegt |
| `backend/server.js` | Graceful Shutdown hinzugefuegt |
| `contexts/master-context.md` | Nodemon-Workflow dokumentiert |

---

## Lessons Learned

1. Nach Backend-Aenderungen **immer** Server-Neustart verifizieren
2. **Nodemon** von Projektstart an verwenden
3. **Nie** mehrere `npm start` parallel ausfuehren
4. Bei unerwartetem Verhalten: Erst alle Node-Prozesse pruefen

---

## Reproduktion

1. Code in `emailOrders.js` aendern
2. Server **nicht** neu starten
3. Email-Orders Seite aufrufen
4. Fehler erscheint trotz korrektem Login

## Verifikation nach Fix

1. Alle Node-Prozesse beenden
2. Server neu starten
3. Als Admin einloggen
4. Email-Orders Seite laden
5. Statistiken und Tabs sollten laden (keine Fehlermeldung)

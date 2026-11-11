# Firebase Realtime Database rules — presence & check-ins

Decision (2026-11-12, app owner): **everyone** using the app may see who is online
and who checked in today. It is no longer admin-only.

| Path | Content | Read |
|---|---|---|
| `telemetry/presence/<deviceId>` | `{t}` anonymous counter | anyone |
| `telemetry/monthly/<YYYY-MM>/<deviceId>` | `true` | anyone |
| `telemetry/presence_ids/<deviceId>` | `{t, id, dept, mode, page}` | **anyone** |
| `telemetry/checkins/<YYYY-MM-DD>/<ID>` | `{first, last, dept, mode}` (Asia/Dhaka date) | **anyone** |

"Checked in" means: that employee ID opened the app today (an ID must be saved in the app).
It is **not** a factory punch / ERP attendance record.

## Paste these rules (Firebase console → Realtime Database → Rules)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "telemetry": {
      "presence": {
        ".read": true,
        "$dev": { ".write": true, ".validate": "newData.hasChildren(['t'])" }
      },
      "monthly": {
        ".read": true,
        "$month": { "$dev": { ".write": true, ".validate": "newData.val() === true" } }
      },
      "presence_ids": {
        ".read": true,
        "$dev": {
          ".write": true,
          ".validate": "newData.hasChildren(['t','id']) && newData.child('id').isString() && newData.child('id').val().length <= 12 && newData.child('dept').val().length <= 4 && newData.child('mode').val().length <= 12 && newData.child('page').val().length <= 16"
        }
      },
      "checkins": {
        ".read": true,
        "$date": {
          ".write": true,
          "$id": {
            ".validate": "$id.length <= 12",
            "first": { ".validate": "newData.isNumber()" },
            "last": { ".validate": "newData.isNumber()" },
            "dept": { ".validate": "newData.isString() && newData.val().length <= 4" },
            "mode": { ".validate": "newData.isString() && newData.val().length <= 12" },
            "$other": { ".validate": false }
          }
        }
      }
    }
  }
}
```

## Things to know (honest limits)

- Because reads are public, **anyone who knows the database URL can read the ID list**, not only app users. The URL is inside the app's source. Tell employees their saved ID is visible to colleagues while the app is open.
- Writes are open (employees are not signed in), so a person could fake an entry. Length/shape checks only limit abuse.
- Old check-in days are auto-deleted by clients after 8 days (best effort); you can also delete `telemetry/checkins/<old date>` in the console.
- Opt-out for a device: `localStorage['renata_presence_share_v1'] = 'off'` (that device is not shown and does not check in).
- The Admin panel's **Online now** tab still works. If you later want it admin-only again, change `presence_ids` `.read` to `"auth != null"` and create an Email/Password admin user (the tab has a sign-in form). That would also hide the list from the public board.
- The `apiKey` in `js/core/config.js` looks like a placeholder. Reading/writing a public-rules database may still work without it, but replace it with the real Web API key from Firebase project settings. (Unverified: I cannot reach Firebase from this environment.)

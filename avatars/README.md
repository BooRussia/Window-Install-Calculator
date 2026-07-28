# Default profile avatars

Cute ocean-creature profile pictures used as the account avatar until a user
uploads their own company logo. Replaces the old initials fallback (which showed
"PW" from the demo brand "Prime Window & Door").

| File | Character |
|---|---|
| `coral-fish.png` | Tropical fish |
| `baby-octopus.png` | Baby octopus |
| `sea-turtle.png` | Sea turtle |
| `seahorse.png` | Seahorse |
| `hermit-crab.png` | Hermit crab |
| `whale.png` | Whale |
| `stingray.png` | Stingray |
| `dolphin.png` | Dolphin |
| `starfish.png` | Starfish (with tiny anchor) |

Assignment is deterministic per auth user id (`brand.avatarId`) so the same
creature sticks across devices until a logo is uploaded.

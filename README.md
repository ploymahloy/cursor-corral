# Cursor Corral
<img width="1024" height="1024" alt="Image" src="https://github.com/user-attachments/assets/bdec0b6d-8912-4dd4-ac75-4b2fe2f5948b" />

**Lasso the cursors, rule the ranch.**

A browser game where you play a cursor rancher rounding up wild cursor “cows” into a corral. Think ranch sim meets pointer chaos—herding on-screen cursors instead of cattle.

## Status

This repo is **early and conceptual**. There is no playable build yet: no game loop, no bundler setup, and no `index.ts` implementation. What exists today is the idea, promo art, and PNG game assets under `assets/png/`.

## Concept

- You control a rancher cursor with a lasso.
- Loose cursor cows wander the pasture.
- Your job is to corral them inside the fence before they scatter again.

Details (controls, scoring, multiplayer, etc.) are still open.

## Assets

| File                     | Size    | Role              |
| ------------------------ | ------- | ----------------- |
| `assets/png/rancher.png` | 48×48   | Rancher character |
| `assets/png/cow.png`     | 32×32   | Cursor cow        |
| `assets/png/lasso.png`   | 32×32   | Lasso (cursor)    |
| `assets/png/fence.png`   | 32×32   | Corral fence      |

## License

ISC (see `package.json`).

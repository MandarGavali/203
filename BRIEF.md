# House walkthrough — builder brief

A three.js walk-through of ONE apartment, built to scale from `ref/plan.png` (the only reference — there are no photos).
The plan *is* the bar: room sizes, where every piece of furniture sits, which way it faces, and the colours it is drawn in.
Nothing outside this flat is built (no stairwell, no neighbours, no street).

## Project
- Root: `C:\Users\DELL\Documents\architecture\house3d`
- There is NO long-running dev server (the machine is short on memory — don't start one). `tools/shot.mjs` starts a temporary Vite for each run and closes it. Always pass `--only <piece>` while iterating (loads just your piece: far faster and lighter). Run one shot command at a time.
- glTF buffers must be `.buf`, never `.bin` — Chrome on this machine never finishes loading `.bin` URLs. `tools/ph.mjs get` already renames them; if you add a model any other way, run `node tools/fix_bin.mjs`.
- Shell (walls, doors, windows, floors, ceiling, skirting) is done in `src/shell.js` from `src/plan.js`. Don't edit those, `src/main.js`, `src/lib/*`, or any other piece's file. If the shell is wrong for your room, say so in your report instead.
- **You edit exactly one file: `src/rooms/<piece>.js`** (default export `async function build(ctx)`, optional `export const views = {...}`).
- API is documented at the top of `src/lib/ctx.js` — read it. All coordinates are **plan feet**: x east, y south, h up from floor. 1 ft = 0.3048 m.
- `face` = the direction an object's front points ('N','S','E','W'). glTF furniture usually has its front on local +Z, which is 'S' at rotation 0 — verify with a screenshot.
- Call `ctx.collide({x1,y1,x2,y2})` for every solid piece of furniture so the walker can't pass through it (leave 2'+ walkways).
- Each indoor room has a default warm fill light named `fill-<roomId>` (a PointLight near the ceiling). You may adjust or remove it (`ctx.scene.getObjectByName('fill-bed1')`) when you add your own fixtures. Anything mounted on the ceiling (pendants, fans) should set `obj.userData.hideInTop = true` so the top-down view isn't blocked.

## Assets — "premium" = the best free CC0 we can get
- Poly Haven (CC0, scanned PBR): `node tools/ph.mjs list models furniture`, `node tools/ph.mjs list models "" <search>` (categories also include decorative, lighting, appliances, plants…), `node tools/ph.mjs list textures <category> <search>`, then `node tools/ph.mjs get <id> 1k` (or 2k for a hero surface). Files land in `public/assets/ph/<id>/` and load as `ctx.model('assets/ph/<id>/<id>_1k.gltf')` (check the real filename) / `ctx.pbr('<id>', {size})`.
- Where nothing scanned fits the plan (built-in wardrobes, counters, beds with the plan's bedspread, TV unit, bathroom fittings…) model it yourself in code with proper detail: bevelled/rounded edges (RoundedBoxGeometry from `three/addons/geometries/RoundedBoxGeometry.js`), real proportions, PBR materials (Poly Haven wood/fabric/stone/metal textures), handles, gaps, legs, shadows. No flat untextured placeholder boxes in the final result.
- You may write procedural canvas textures (e.g. the striped bedspread) with `THREE.CanvasTexture` — make them high-res and believable (fabric weave via normal map from a fabric texture).
- Keep the piece reasonable to load: 1k textures for furniture, 2k only for big hero surfaces; aim for < 40 MB of new assets per piece.

## Screenshots
- `node tools/shot.mjs <view...> top:<piece> --only <piece> --out shots/<piece>/<round>` → PNGs. Views are in `src/views.js` (you can add/override views by exporting `views` from your room file; same format). `top:<piece>` is an orthographic top-down cutaway of your rooms oriented like the plan (north up) — compare it directly with `ref/crops/<piece>.png`.
- Look at your screenshots (Read the PNG) after every meaningful change. Fix console errors the tool prints.

## Look & finish (whole house, keep consistent)
- Walls: warm white matte paint (shell). Living/dining/kitchen floors: 60 cm light marble-look vitrified tiles (shell). Bedrooms: oak laminate (shell). Toilets/wash: grey-beige matt tiles (shell floor; you add wall tiling in the toilets to ~7 ft, plus fittings).
- Furniture colours come from the plan drawing: rust-brown diagonal-striped bedspreads with cream ground; plum/aubergine wardrobes (drawn purple with the zigzag "hanging clothes" symbol); royal/navy blue upholstered dining chairs; golden-amber marble dining top; living sofas drawn magenta-outlined with blue frame lines and red/coral cushions; orange-mustard balcony cushions; black round balcony table; green plants.
- Daylight interior, contemporary Indian apartment, tasteful and believable. Premium means: correct scale, nothing floating or intersecting, contact shadows, real materials, small lived-in details (books, throw, cushions, a plant, art, bathroom accessories) where they suit the room — but never contradict the plan.

## Per-room spec (from the plan; positions in plan feet; ±0.5 ft is fine)
(Rooms' interior rectangles are in `src/plan.js`.)

### bed1 — Bedroom 1, 10'0"x11'0" (x 0.5–10.5, y 0.5–11.5) + attached toilet 4'x7' (x 11–15, y 0.5–7.5)
- Window on N wall x 2.5–8.5 (sill 3', head 7.5'). Door from dining on E wall y 8–11. Toilet door on E wall y 5–7.5.
- Queen bed (5' x 6'8") headboard against N wall under the window, centred x≈5.3, foot toward south. Rust-brown diagonal-stripe bedspread, two white pillows. Plan also shows a brown rectangular outline under the bed's lower half (x 2.4–7.9, y 3.8–6.9) — a rug or the bed base.
- Two nightstands with round table lamps either side of the headboard: x≈1.5–2.9 and x≈7.7–9.2, y 0.5–2.0.
- Built-in wardrobe along the S wall x 0.5–8.0, y 9.5–11.5 (2' deep), floor to ~7.5', plum/aubergine shutters.
- Toilet A: wall-hung basin on its E wall near the south end (y≈6.4) with mirror; WC + shower area at the north end under the high ventilator (N wall x 12–13.8). Wall tiles to 7'.

### bed2 — Bedroom 2, 11'0"x13'0" (x 0.5–11.5, y 21–34) + attached toilet 10'x4' (x 0.5–10.5, y 16.5–20.5) + 3' balcony (x 0–11.5, y 34.5–37.5)
- Door from lobby on E wall y 21–24. Toilet door on N wall x 6.5–9.0. Sliding glass door to balcony on S wall x 2.5–10.
- Built-in wardrobe along the W wall x 0.5–2.3, y 21–28, plum/aubergine.
- Queen bed headboard against E wall (x 11.5), bed x≈5.6–11.5, y≈25.3–30.7, facing west. Rust-brown striped bedspread.
- Nightstands with round lamps against E wall at y≈24.7–26.3 and y≈29.8–31.5.
- Toilet C: basin on its E wall (y≈18.5) — plan shows a thin partition at x≈9.0 separating a basin/dry zone; WC + shower toward the west end under the ventilator (W wall y 17.5–19). Wall tiles.
- Balcony: two small potted shrubs at the west and east ends of the balcony.

### bed3 — Bedroom 3, 12'0"x13'0" (x 12–24, y 24.5–37.5)
- Door on N wall x 12–15 (from lobby). Window on S wall x 15.5–21 (sill 3').
- Built-in wardrobe along the N wall x 16.7–24.0, y 24.5–26.3, plum/aubergine.
- Queen bed headboard against E wall (x 24), bed x≈17.8–24, y≈28–33.8, facing west. Rust-brown striped bedspread.
- Nightstands with round lamps against E wall at y≈27.5–29.2 and y≈32.8–34.3.

### kitchen — Kitchen 10'x13' (x 22–32, y 0.5–13.5) + Wash 6'x7' (x 15.5–21.5, y 0.5–7.5) + utility ledge (x 15–21.5, y −2.5–0)
- Kitchen opens west to the dining (no wall below y 8) and at its SW corner. Window N wall x 23.5–29.5 (sill 3.5').
- L-shaped counter: along N wall x 22–30, y 0.5–2.5; along E wall x 30–32, y 0.5–7.8. 2'10" high, black granite top, modular base cabinets + wall cabinets (not over the window). Stainless single-bowl sink with drainboard at x≈22.5–24.8 on the N run; 4-burner glass hob at x≈26.7–28.6 with a chimney hood above.
- Second counter along the S wall x 24.9–32, y 11.8–13.5 (storage / breakfast counter).
- Wash: glazed slider to dining on its S side, open slider to the utility ledge on N. Plan shows it empty — fit it as a utility: front-load washing machine, utility sink/tap, wall tiles. Utility ledge: clothes-drying rack, a couple of pots — modest.

### dining — Dining 11'0"x14'1" (x 11–24.5, y 8–20.5) + basin nook (x 8–11, y 12–16) + common toilet 7'x4' (x 0.5–7.5, y 12–16) + lobby (x 12–24.5, y 20.5–24)
- 6-seat dining table centred ≈(16.0, 15.4), long axis N–S, ~3' x 5'6", golden-amber marble top. Six royal-blue upholstered chairs: one at each end, two on each long side.
- Basin nook: wall-hung vanity basin against the nook's N wall at x≈8.9, with mirror and light.
- Common toilet B: door on its E wall y 13–15.5; ventilator on W wall y 13–14.8; WC, shower, wall tiles.
- Lobby: a sofa/daybed with its back against bedroom 3's N wall, x≈18.8–23.9, y≈21.5–24.0, facing north toward the table — magenta/fuchsia upholstery with blue base/arm and red cushions as drawn.

### living — Living 13'11"x17'0" (x 24.5–38.42, y 14–31) + 5'9" balcony (x 24.5–38.92, y 31.5–37.25)
- Living is open to the dining on its west side (y 14–24). Main entrance door (closed) on N wall x 34.9–38.4. Big sliding door to the balcony on S wall x 26.5–36.
- 3-seater sofa at the west side x≈24.8–27.0, y≈20.2–26.9, facing EAST toward the TV. Magenta-outlined with blue frame lines, red cushions (match the plan colours).
- Armchair N at x≈27.2–29.8, y≈17.7–20.4 facing south; armchair S at x≈27.3–29.9, y≈26.6–29.2 facing north. Same family as the sofa.
- Two corner side tables with lamps: x≈25.2–26.7 at y≈18.0–19.6 and y≈27.3–29.1.
- Square coffee table x≈27.8–30.5, y≈22.0–25.2: glass top with blue/navy frame and dark patterned centre.
- TV unit on E wall x≈36.7–38.42, y≈19.7–26.8: low console + wall-mounted TV; gold/black-spotted decor pieces (planters/vases) at both ends as drawn.
- Balcony: at its west end a potted green plant (≈x 25–27, y 32.5–34.5), two mustard-orange floor cushions/poufs, a small round black table.

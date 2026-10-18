// Floor plan in FEET. Plan x = east, plan y = south (as the drawing reads).
// Three.js: X = x * FT, Z = y * FT, Y = up. Interior room sizes follow the plan labels.
// Reference drawing: ref/plan.png  (~28 px per foot, outer NW corner at px (40,133)).

export const FT = 0.3048;
export const CEILING = 10; // ft
export const WALL = 0.5;   // ft, all walls drawn ~6" on the plan

// Rooms: interior rectangles (ft). `label` is what the plan prints.
export const rooms = {
  bed1:    { name: 'Bedroom 1',        label: "10'0\" x 11'0\"",  x1: 0.5,  y1: 0.5,  x2: 10.5,  y2: 11.5, floor: 'wood' },
  toiletA: { name: 'Toilet (attached)',label: "4'0\" x 7'0\"",    x1: 11.0, y1: 0.5,  x2: 15.0,  y2: 7.5,  floor: 'bathtile' },
  wash:    { name: 'Wash',             label: "6'0\" x 7'0\"",    x1: 15.5, y1: 0.5,  x2: 21.5,  y2: 7.5,  floor: 'bathtile' },
  utility: { name: 'Utility ledge',    label: '',                 x1: 15.0, y1: -2.5, x2: 21.5,  y2: 0.0,  floor: 'deck', outdoor: true },
  kitchen: { name: 'Kitchen',          label: "10'0\" x 13'0\"",  x1: 22.0, y1: 0.5,  x2: 32.0,  y2: 13.5, floor: 'tile' },
  dining:  { name: 'Dining',           label: "11'0\" x 14'1\"",  x1: 11.0, y1: 8.0,  x2: 24.5,  y2: 20.5, floor: 'tile' },
  vest:    { name: 'Wash basin nook',  label: '',                 x1: 8.0,  y1: 12.0, x2: 11.0,  y2: 16.0, floor: 'tile' },
  toiletB: { name: 'Toilet (common)',  label: "7'0\" x 4'0\"",    x1: 0.5,  y1: 12.0, x2: 7.5,   y2: 16.0, floor: 'bathtile' },
  toiletC: { name: 'Toilet (attached)',label: "10'0\" x 4'0\"",   x1: 0.5,  y1: 16.5, x2: 10.5,  y2: 20.5, floor: 'bathtile' },
  bed2:    { name: 'Bedroom 2',        label: "11'0\" x 13'0\"",  x1: 0.5,  y1: 21.0, x2: 11.5,  y2: 34.0, floor: 'wood' },
  balc2:   { name: "3' Balcony",       label: "3' wide",          x1: 0.0,  y1: 34.5, x2: 11.5,  y2: 37.5, floor: 'deck', outdoor: true },
  bed3:    { name: 'Bedroom 3',        label: "12'0\" x 13'0\"",  x1: 12.0, y1: 24.5, x2: 24.0,  y2: 37.5, floor: 'wood' },
  living:  { name: 'Living Room',      label: "13'11\" x 17'0\"", x1: 24.5, y1: 14.0, x2: 38.42, y2: 31.0, floor: 'tile' },
  balcL:   { name: "5'9\" Balcony",    label: "5'9\" wide",       x1: 24.5, y1: 31.5, x2: 38.92, y2: 37.25, floor: 'deck', outdoor: true },
};

// Extra floor patches so the open plan has no holes (lobby between bedrooms, kitchen mouth).
export const floorPatches = [
  { x1: 12.0, y1: 20.5, x2: 24.5, y2: 24.0, floor: 'tile' },  // lobby in front of bedroom doors
  { x1: 22.0, y1: 13.5, x2: 24.5, y2: 14.0, floor: 'tile' },
  { x1: 11.0, y1: 7.5,  x2: 22.0, y2: 8.0,  floor: 'tile' },
  { x1: 11.5, y1: 21.0, x2: 12.0, y2: 24.0, floor: 'wood' },  // bed2 door threshold
  { x1: 12.0, y1: 24.0, x2: 15.0, y2: 24.5, floor: 'wood' },  // bed3 door threshold
  { x1: 10.5, y1: 8.0,  x2: 11.0, y2: 11.0, floor: 'wood' },  // bed1 door threshold
  { x1: 10.5, y1: 5.0,  x2: 11.0, y2: 7.5,  floor: 'bathtile' },
  { x1: 7.5,  y1: 13.0, x2: 8.0,  y2: 15.5, floor: 'bathtile' },
  { x1: 6.5,  y1: 20.5, x2: 9.0,  y2: 21.0, floor: 'bathtile' },
  { x1: 15.5, y1: 0.0,  x2: 21.5, y2: 0.5,  floor: 'bathtile' },
  { x1: 21.5, y1: 5.0,  x2: 22.0, y2: 7.5,  floor: 'bathtile' },  // wash door threshold
  { x1: 2.5,  y1: 34.0, x2: 10.0, y2: 34.5, floor: 'wood' },
  { x1: 26.5, y1: 31.0, x2: 36.0, y2: 31.5, floor: 'tile' },
  { x1: 34.9, y1: 13.5, x2: 38.42,y2: 14.0, floor: 'tile' },
];

// Solid full-height walls (axis-aligned rectangles, ft).
export const walls = [
  // north exterior
  { x1: 0, y1: 0, x2: 2.5, y2: 0.5 },
  { x1: 8.5, y1: 0, x2: 12.0, y2: 0.5 },
  { x1: 13.8, y1: 0, x2: 15.5, y2: 0.5 },
  { x1: 21.5, y1: 0, x2: 23.5, y2: 0.5 },
  { x1: 29.5, y1: 0, x2: 32.5, y2: 0.5 },
  // kitchen east (stair lobby outside)
  { x1: 32.0, y1: 0.5, x2: 32.5, y2: 13.5 },
  // west exterior
  { x1: 0, y1: 0.5, x2: 0.5, y2: 13.0 },
  { x1: 0, y1: 14.8, x2: 0.5, y2: 17.5 },
  { x1: 0, y1: 19.0, x2: 0.5, y2: 34.5 },
  // bedroom 1 east / toilet A west
  { x1: 10.5, y1: 0.5, x2: 11.0, y2: 5.0 },
  { x1: 10.5, y1: 7.5, x2: 11.0, y2: 8.0 },
  { x1: 10.5, y1: 11.0, x2: 11.0, y2: 11.5 },
  // toilet A south, toilet A / wash, wash / kitchen
  { x1: 11.0, y1: 7.5, x2: 15.0, y2: 8.0 },
  { x1: 15.0, y1: 0.5, x2: 15.5, y2: 8.0 },
  { x1: 21.5, y1: 0.5, x2: 22.0, y2: 5.0 },   // wash / kitchen (door y 5.0-7.5: the plan's thin line)
  { x1: 21.5, y1: 7.5, x2: 22.0, y2: 8.0 },
  // bedroom 1 south
  { x1: 0.5, y1: 11.5, x2: 11.0, y2: 12.0 },
  // toilet B east (door 13.0-15.5)
  { x1: 7.5, y1: 12.0, x2: 8.0, y2: 13.0 },
  { x1: 7.5, y1: 15.5, x2: 8.0, y2: 16.0 },
  // toilet B / toilet C
  { x1: 0.5, y1: 16.0, x2: 11.0, y2: 16.5 },
  // toilet C east
  { x1: 10.5, y1: 16.5, x2: 11.0, y2: 20.5 },
  // toilet C / bedroom 2 (door 6.5-9.0)
  { x1: 0.5, y1: 20.5, x2: 6.5, y2: 21.0 },
  { x1: 9.0, y1: 20.5, x2: 12.0, y2: 21.0 },
  // bedroom 2 east = bedroom 3 west (door into bed2 at y 21-24)
  { x1: 11.5, y1: 24.0, x2: 12.0, y2: 38.0 },
  // bedroom 3 north (door x 12-15)
  { x1: 15.0, y1: 24.0, x2: 24.5, y2: 24.5 },
  // bedroom 3 east (continues as balcony side wall)
  { x1: 24.0, y1: 24.5, x2: 24.5, y2: 38.0 },
  // bedroom 3 south (window 15.5-21.0)
  { x1: 12.0, y1: 37.5, x2: 15.5, y2: 38.0 },
  { x1: 21.0, y1: 37.5, x2: 24.0, y2: 38.0 },
  // bedroom 2 south (balcony door 2.5-10.0)
  { x1: 0, y1: 34.0, x2: 2.5, y2: 34.5 },
  { x1: 10.0, y1: 34.0, x2: 11.5, y2: 34.5 },
  // kitchen south / living north (main door 34.9-38.42)
  { x1: 24.5, y1: 13.5, x2: 32.0, y2: 14.0 },
  { x1: 32.0, y1: 13.5, x2: 34.9, y2: 14.0 },
  { x1: 38.42, y1: 13.5, x2: 38.92, y2: 14.0 },
  // living east
  { x1: 38.42, y1: 14.0, x2: 38.92, y2: 31.5 },
  // living south (balcony slider 26.5-36.0)
  { x1: 24.5, y1: 31.0, x2: 26.5, y2: 31.5 },
  { x1: 36.0, y1: 31.0, x2: 38.92, y2: 31.5 },
];

// Windows in walls: wall below sill and above head, frame + glass between.
export const windows = [
  { x1: 2.5,  y1: 0,    x2: 8.5,  y2: 0.5,  sill: 3.0, head: 7.5, room: 'bed1' },
  { x1: 12.0, y1: 0,    x2: 13.8, y2: 0.5,  sill: 6.0, head: 7.5, room: 'toiletA' },
  { x1: 23.5, y1: 0,    x2: 29.5, y2: 0.5,  sill: 3.5, head: 7.5, room: 'kitchen' },
  { x1: 0,    y1: 13.0, x2: 0.5,  y2: 14.8, sill: 6.0, head: 7.5, room: 'toiletB' },
  { x1: 0,    y1: 17.5, x2: 0.5,  y2: 19.0, sill: 6.0, head: 7.5, room: 'toiletC' },
  { x1: 15.5, y1: 37.5, x2: 21.0, y2: 38.0, sill: 3.0, head: 7.5, room: 'bed3' },
  { x1: 15.5, y1: 7.5,  x2: 21.5, y2: 8.0,  sill: 3.0, head: 7.0, room: 'wash' },   // plan's blue line wash->dining is glazing, not a door
];

// Door openings: header above `head`. `leaf` adds a hinged door swung open (deg) or a slider.
// hinge: which end of the opening the leaf hangs on; swing: which side it opens into.
export const doors = [
  { id: 'bed1',    x1: 10.5, y1: 8.0,  x2: 11.0, y2: 11.0, head: 7, leaf: { type: 'hinged', hinge: 'y2', into: 'W', open: 80 } },
  { id: 'toiletA', x1: 10.5, y1: 5.0,  x2: 11.0, y2: 7.5,  head: 7, leaf: { type: 'hinged', hinge: 'y1', into: 'W', open: 75 } },  // opens out: inward it filled the 4' toilet
  { id: 'toiletB', x1: 7.5,  y1: 13.0, x2: 8.0,  y2: 15.5, head: 7, leaf: { type: 'hinged', hinge: 'y1', into: 'W', open: 75 } },
  { id: 'toiletC', x1: 6.5,  y1: 20.5, x2: 9.0,  y2: 21.0, head: 7, leaf: { type: 'hinged', hinge: 'x1', into: 'S', open: 75 } },  // opens out into bed2: inward it filled the 4' toilet
  { id: 'bed2',    x1: 11.5, y1: 21.0, x2: 12.0, y2: 24.0, head: 7, leaf: { type: 'hinged', hinge: 'y1', into: 'W', open: 80 } },
  { id: 'bed3',    x1: 12.0, y1: 24.0, x2: 15.0, y2: 24.5, head: 7, leaf: { type: 'hinged', hinge: 'x1', into: 'S', open: 80 } },
  { id: 'main',    x1: 34.9, y1: 13.5, x2: 38.42,y2: 14.0, head: 7, leaf: { type: 'hinged', hinge: 'x2', into: 'S', open: 0, main: true } },
  { id: 'wash',    x1: 21.5, y1: 5.0,  x2: 22.0, y2: 7.5,  head: 7, leaf: { type: 'hinged', hinge: 'y1', into: 'E', open: 85 } },
  { id: 'utility', x1: 15.5, y1: 0,    x2: 21.5, y2: 0.5,  head: 7.5, leaf: { type: 'slider', glass: true } },
  { id: 'balc2',   x1: 2.5,  y1: 34.0, x2: 10.0, y2: 34.5, head: 7.5, leaf: { type: 'slider', glass: true } },
  { id: 'balcL',   x1: 26.5, y1: 31.0, x2: 36.0, y2: 31.5, head: 7.5, leaf: { type: 'slider', glass: true } },
];

// Balcony railings (ft): line segments along the slab edge.
export const railings = [
  { x1: 15.0, y1: -2.5, x2: 21.5, y2: -2.5 },
  { x1: 15.0, y1: -2.5, x2: 15.0, y2: 0 },
  { x1: 21.5, y1: -2.5, x2: 21.5, y2: 0 },
  { x1: 0,    y1: 37.5, x2: 11.5, y2: 37.5 },
  { x1: 0,    y1: 34.5, x2: 0,    y2: 37.5 },
  { x1: 24.5, y1: 37.25, x2: 38.92, y2: 37.25 },
  { x1: 38.92, y1: 31.5, x2: 38.92, y2: 37.25 },
];

// Pieces judged separately: which rooms each covers and the plan crop (px box in ref/plan.png).
export const pieces = {
  bed1:    { rooms: ['bed1', 'toiletA'],                 crop: [35, 128, 460, 460],  title: 'Bedroom 1 (10x11) + attached toilet 4x7' },
  bed2:    { rooms: ['bed2', 'toiletC', 'balc2'],        crop: [35, 555, 395, 1180], title: "Bedroom 2 (11x13) + attached toilet 10x4 + 3' balcony" },
  bed3:    { rooms: ['bed3'],                            crop: [375, 755, 745, 1180],title: 'Bedroom 3 (12x13)' },
  kitchen: { rooms: ['kitchen', 'wash', 'utility'],      crop: [430, 55, 945, 525],  title: 'Kitchen (10x13) + wash (6x7) + utility ledge' },
  dining:  { rooms: ['dining', 'vest', 'toiletB'],       crop: [35, 340, 745, 775],  title: "Dining (11x14'1\") + basin nook + common toilet 7x4 + lobby" },
  living:  { rooms: ['living', 'balcL'],                 crop: [720, 500, 1159, 1180], title: "Living (13'11\"x17') + 5'9\" balcony" },
};

export const toM = (ft) => ft * FT;

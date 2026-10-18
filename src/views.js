// Fixed camera views for screenshots, in plan feet. pos/look = [x, y]; h/lookH = eye/target height (ft).
// Room modules may export their own `views` to add or override these.
export const defaultViews = {
  'bed1-a':     { pos: [10.0, 8.8],  look: [3, 2.5] },
  'bed1-b':     { pos: [1.3, 8.8],   look: [9, 1.5] },
  'bed1-toilet':{ pos: [14.3, 6.9],  look: [11.5, 1.5], fov: 78 },
  'bed2-a':     { pos: [10.8, 22.3], look: [3, 30] },
  'bed2-b':     { pos: [1.8, 33.2],  look: [10, 24] },
  'bed2-toilet':{ pos: [8.0, 20.0],  look: [1.5, 17.5], fov: 78 },
  'bed2-balcony':{ pos: [6, 31.5],   look: [6, 37.5], lookH: 3.5 },
  'bed3-a':     { pos: [13.2, 25.5], look: [22, 33] },
  'bed3-b':     { pos: [13.0, 36.5], look: [22, 27] },
  'kitchen-a':  { pos: [23.5, 12.6], look: [29, 2], lookH: 3.5 },
  'kitchen-b':  { pos: [27, 9.5],    look: [23, 1], lookH: 3.5 },
  'kitchen-wash':{ pos: [18.5, 10],  look: [18.5, 1] },
  'dining-a':   { pos: [22.5, 20.3], look: [15, 13], lookH: 3.2 },
  'dining-b':   { pos: [12, 9],      look: [18, 18], lookH: 3.2 },
  'dining-nook':{ pos: [13.5, 14.5], look: [8.5, 13] },
  'dining-toilet':{ pos: [6.8, 15.4], look: [1, 12.6], fov: 78 },
  'living-a':   { pos: [25.5, 30.3], look: [35, 18] },
  'living-b':   { pos: [37.5, 15],   look: [27, 26] },
  'living-c':   { pos: [36.5, 29.8], look: [25.5, 20] },
  'living-balcony':{ pos: [30, 30.2], look: [33, 37], lookH: 3 },
};

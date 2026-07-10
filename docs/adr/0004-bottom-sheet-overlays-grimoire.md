# The night/day bottom sheet overlays the grimoire; it never resizes it

The bottom sheet holding the night list (and, since the phase-aware work, the day controls) floats over the grimoire circle as a fixed-height overlay. The circle keeps its full size regardless of the sheet's state; when the sheet is expanded it simply covers the circle's lower portion, and the peek state covers only a sliver.

This reverses the earlier behavior, where the board actively measured the sheet's height and subtracted it from the circle's layout budget — a dedicated `ResizeObserver` on the sheet re-fit the circle every time the sheet expanded or collapsed. That kept the whole circle visible but shrank it, and the constant re-fitting made the sheet feel like it was fighting the board. We chose a glanceable, full-size circle (the storyteller's primary surface, read at a glance in the dark) over one that is always fully visible but smaller. The sheet is a transient action surface pulled up when needed and pushed back down; a maps-style overlay is the familiar pattern for that.

## Consequences

- The measure-and-reserve machinery (the sheet `ResizeObserver`, the `sheetReservePx` subtraction, and the phase-swap re-measure) is removed. Do not reintroduce circle re-fitting keyed to the sheet — occluding the lower circle when the sheet is open is intended, not a regression.
- The sheet has a fixed expanded height (~45% of viewport height) with its content scrolling internally, so the amount of circle it covers is predictable and the storyteller can always drag it back down.
- Anything the storyteller must see while the sheet is open belongs above the sheet's reach or in the sheet's always-visible peek slots, not in the occluded lower band of the circle.

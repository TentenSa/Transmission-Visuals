# Transmission Visuals

Interactive 3D pages that show what a transmission control unit (TCU) does.
Each page is one HTML file that runs offline in any browser.

**Live pages**
- [TCU: Transmission Control](https://tentensa.github.io/Transmission-Visuals/tcu-sim/)
- [Four Ways to Change Ratio](https://tentensa.github.io/Transmission-Visuals/tx-types/)

## Pages

### 1. TCU: Transmission Control (`tcu-sim/`)
An 8-speed planetary automatic through a 54 s drive: launch, cruise, kickdown, brake to a stop.
- **Sense:** pedal and engine speed over CAN; turbine speed, output speed and oil temperature sensors
- **Decide:** live shift map with upshift and downshift lines and the hysteresis between them
- **Actuate:** pressure per shift element through fill, torque phase and inertia phase; torque cut request to the engine
- Take over with the pedal and brake sliders and drive it yourself

### 2. Four Ways to Change Ratio (`tx-types/`)
One car, one pedal, one 14 s launch through an AT, a CVT, an AMT and a DCT.
- What the TCU senses and drives in each type, and the hard part of each
- Push at the wheels and engine speed for all four, side by side
- Clutch-to-clutch handover, belt and pulleys, the AMT torque gap and the DCT clutch crossover, in 3D

## Run
Open `tcu-sim/index.html` or `tx-types/index.html` in a browser. No install, no network.

## Data
A generic model built from public engineering knowledge. The gear ratios and
shift-element table on the 8-speed page follow a published 8-speed design.
Vehicle, engine and calibration values are illustrative and come from no product.

## Source
Each folder holds the model (`model.js`), the 3D scene (`scene.js`) and the page
logic (`main.js`, `ui.js`). The pages are built into single files with esbuild.

## License
MIT, see [LICENSE](LICENSE).

## Credits
Bundled third-party code: three.js (MIT), the Teardown toolkit (MIT),
Inter and JetBrains Mono fonts (SIL Open Font License).

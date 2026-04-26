# Teachable Machine Model Files

Export your Teachable Machine image model as **TensorFlow.js** and place the
exported files in this folder.

Required files:

- `model.json`
- `metadata.json`
- the weight file(s) referenced by `model.json` such as `model.weights.bin`

Expected class labels:

- `mouth_open`
- `mouth_closed`

If your export uses a different class name for the open-mouth state, update
`static/tm-config.js` and change `openLabel`.

If the model feels too sensitive or not sensitive enough, adjust
`openThreshold` in `static/tm-config.js`.

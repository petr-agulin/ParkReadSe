# The demo set: the model's saved answers

Answers from both stages on the photographs of the test set. The accuracy measurement
and the regression checks stand on them: the same input gives the same output, and no
key is needed for it.

The file name is `<photo>.<stage>.json`, and there are two stages: `triage` and
`extract`.

## The `origin` field — read it first

| Value | What it is |
|---|---|
| `model` | **a real answer of the model**, saved during a live call. It carries `usage` — the token count |
| `hand_marked` | a ground truth marked by hand and placed here as a seed |

The difference matters: measuring the model against a ground truth the model did not
write measures the wrong thing. Only `model` files go into the measurement.

## The `prompt_fingerprint` field

The fingerprint of the prompt the answer was obtained with. If the prompt changed, the
answer is to the previous question, and the measurement **excludes** it, naming it
aloud. Two versions of the question may not be mixed into one number.

## How the set grows

`npm run ask -- testset/photos/<photo>` asks the model and saves here every answer
that passed validation, together with its `usage`. The developer runs this command: it
spends the key and the quota.

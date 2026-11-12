---
status: accepted
---

# One kind of cockpit design: parametric cockpits become CAD parts

Today a cockpit design is parametric: about thirty dimensions from which the model derives the profiles and parts. The mini CAD works the other way round, with placed parts and joints in mm as the data and the dimensions read from them. We keep a single kind of design. When the CAD arrives, an explicit adapter converts every parametric cockpit once into CAD parts, and the bases (GT, flight, hybrid, smallest footprint) become starting points for CAD designs. The parametric editor is retired only when the CAD covers what it does, so the configurator keeps working in the meantime.

## Considered options

- **Parametric and CAD designs side by side.** The parametric editor would stay as a quick way to start, but everything the room needs from a cockpit (envelopes, eye point, part list, checks) would have to work on two models that don't match.

## Consequences

- The conversion must produce the same dimensions as the parametric model, proven by tests against known cases. Otherwise opening an existing design in the CAD would change it without anyone touching it.
- The cockpit is separated from the room before the CAD starts, with the parametric design, so that the file format change and the conversion to parts land as two separate migrations.

---
status: accepted
---

# Retire the parametric cockpit without converting it

ADR 0002 planned to convert every parametric cockpit once into CAD parts and to retire the parametric editor only when the CAD covered what it does. Stage 1 built that conversion, and it showed the cost: every base converts with the crossing and unsupported parts its drawing hid, the editor would have to keep the parametric sliders working on hand-edited parts, and the file format would need a migration that reproduces old designs exactly. We retire the parametric cockpit instead. A project file that holds one opens with its room only, the cockpit is designed again from parts, and new designs start empty. The mini CAD is the product; until it is complete, from the frame to the seat and the controls, a room cannot include the cockpit design.

## Considered options

- **Convert, as ADR 0002 planned.** Keeps existing designs, but ties the editor to sliders and bases that the CAD does not need, and makes the format change the riskiest step of the stage.
- **Keep the parametric cockpit beside the CAD.** Already rejected in ADR 0002: two models that don't match.

## Consequences

- Supersedes ADR 0002. Rooms in v1 to v4 project files still open; their cockpits are left out, with a message. Cockpit files of version 1 are rejected.
- The bases, the conversion and the parametric drawing are deleted, not hidden. The parts model, joints, support, interference, cuts and catalog of stage 1 stay.
- Until the cockpit returns to the room, the room has no cockpit interference, posture or monitor aiming at the eye point.

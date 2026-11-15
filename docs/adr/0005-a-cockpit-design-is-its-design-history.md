---
status: accepted
---

# A cockpit design is its design history

A cockpit design is stored as its design history: the ordered list of operations that builds it, such as adding an anchored profile, growing one out of a face, making a span, removing a part or putting connectors on a joint. Its parts, joints and connectors are what replaying the history gives. The user can move a history marker back, change the values of an earlier operation or insert new ones there, and everything after it is replayed, as in a parametric CAD's timeline. Attachments (ADR 0003) still decide how parts follow one another; the history adds the order of construction and the ability to change it.

## Considered options

- **Store the parts with their attachments, with undo and redo only.** Simpler to store and to read back, and lengthening a part already carries its children along. But an earlier step, such as which face a profile grows from, could only be changed by rebuilding everything after it by hand.
- **Parts as the stored data, with a read-only log of steps.** Shows how a design was built without letting the user change it, which is the half of the history that matters least.

## Consequences

- Every kind of operation is part of the file format and must be readable for as long as the format version is. A new or changed operation is a format change.
- Replaying can fail: an operation whose part or face is gone becomes a failed operation, marked and kept, adding nothing to the design. Operations that depend on it fail too; the others still apply.
- Editing a part's size, position or name changes the values of the operation that made it rather than adding a step. Removing a part is an operation; deleting an operation takes what it made out of the whole history.
- Undo and redo are separate from the history: they step through the edits made to it while the design is open, and are not saved.

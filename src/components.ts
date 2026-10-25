import { createComponent, defineComponents, Types } from '@iwsdk/core';

/** Marks a grabbable task card and links it to its task in the model. */
export const TaskCardTag = createComponent('TaskCardTag', {
  taskId: { type: Types.String, default: '' },
});

/** Root of the desk kit (plant, ring, cards, panel) that gets placed on the desk. */
export const DeskKit = createComponent('DeskKit', {
  placed: { type: Types.Boolean, default: false },
});

export default defineComponents([TaskCardTag, DeskKit]);

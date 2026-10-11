import { z } from 'zod';
import { validateTextureSafety } from './shared/features';
import { drawerConfigSchema } from '../shapes/drawer/domain/design';
import { potWithTrayConfigSchema } from '../shapes/pot-with-tray/domain/design';
import { potConfigSchema } from '../shapes/pot/domain/design';

export const designConfigSchema = z
    .discriminatedUnion('type', [potConfigSchema, potWithTrayConfigSchema, drawerConfigSchema])
    .superRefine((value, context) =>
        validateTextureSafety(value.texture, value.parameters.wallThicknessMm, context),
    );

export type DesignConfig = z.infer<typeof designConfigSchema>;

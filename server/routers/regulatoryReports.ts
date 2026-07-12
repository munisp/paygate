import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';

export const regulatoryReportsRouter = router({
  // Dummy procedure to satisfy TypeScript
  ping: publicProcedure.query(() => 'pong'),
});

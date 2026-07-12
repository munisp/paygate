import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';

export const kycRouter = router({
  // Dummy procedure to satisfy TypeScript
  ping: publicProcedure.query(() => 'pong'),
});

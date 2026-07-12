import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';

export const chargebackLifecycleRouter = router({
  // Dummy procedure to satisfy TypeScript
  ping: publicProcedure.query(() => 'pong'),
});

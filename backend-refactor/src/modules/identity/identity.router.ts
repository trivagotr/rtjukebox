import { Router } from 'express';
import { identityController } from './identity.controller.js';

export function createIdentityRouter() {
  const router = Router();

  router.post('/register', identityController.register);
  router.post('/login', identityController.login);

  return router;
}

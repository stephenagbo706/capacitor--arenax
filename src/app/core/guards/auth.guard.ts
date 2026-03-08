import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ArenaService } from '../services/arena.service';

export const authGuard: CanActivateFn = () => {
  const arena = inject(ArenaService);
  const router = inject(Router);
  const user = arena.getCurrentUser();
  if (!user) {
    router.navigateByUrl('/auth/login');
    return false;
  }
  return true;
};

import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { LanguageService } from './language.service';

/** Sends the participant's UI language so any localized server response matches. */
export const languageHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const lang = inject(LanguageService).active();
  return next(req.clone({ setHeaders: { 'Accept-Language': lang } }));
};

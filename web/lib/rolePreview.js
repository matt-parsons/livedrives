import { cookies } from 'next/headers';

export const ROLE_PREVIEW_COOKIE_NAME = 'ld-role-preview';
export const ROLE_PREVIEW_SUPPORTED_ROLES = new Set(['member']);

export function getRolePreviewCookie(request) {
  if (request?.cookies) {
    const cookie = typeof request.cookies.get === 'function'
      ? request.cookies.get(ROLE_PREVIEW_COOKIE_NAME)
      : request.cookies[ROLE_PREVIEW_COOKIE_NAME];

    return cookie?.value ?? cookie ?? null;
  }

  return cookies().get(ROLE_PREVIEW_COOKIE_NAME)?.value ?? null;
}

export function isRolePreviewSupported(role) {
  return ROLE_PREVIEW_SUPPORTED_ROLES.has(role);
}

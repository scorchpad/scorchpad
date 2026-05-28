// src/lib/securityAudit.ts
export function auditLocalStorage(): void {
  if (typeof window === 'undefined') return;
  const sensitiveTerms = ['key', 'plaintext', 'password', 'blob', 'decrypt'];
  Object.keys(localStorage).forEach((k) => {
    if (sensitiveTerms.some((term) => k.toLowerCase().includes(term))) {
      console.error(`[SECURITY] Sensitive key found in localStorage: ${k}`);
    }
  });
}

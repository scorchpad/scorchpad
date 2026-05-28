'use client';
import { useEffect } from 'react';
import { auditLocalStorage } from '../lib/securityAudit';

export function SecurityAuditMount() {
  useEffect(() => {
    auditLocalStorage();
  }, []);
  return null;
}

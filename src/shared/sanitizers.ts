export const sanitizeTextInput = (value: string): string => value.replace(/[<>"'`]/g, '').trim();

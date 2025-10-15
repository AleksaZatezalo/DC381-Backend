export const ok = (res, data = {}, code = 200) => res.status(code).json(data);
export const created = (res, data = {}) => res.status(201).json(data);
export const badRequest = (res, message) => res.status(400).json({ message });
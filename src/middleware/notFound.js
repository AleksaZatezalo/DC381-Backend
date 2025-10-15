export const notFound = (_req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
};

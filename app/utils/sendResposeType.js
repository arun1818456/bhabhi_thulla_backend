// Helper for consistent response format
const sendResponse = (res, status, success, message, data = null, error = null) => {
  return res.status(status).json({ success, message, data, error });
};
export { sendResponse };
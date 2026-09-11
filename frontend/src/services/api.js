import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getCollections = () => api.get('/api/collections');
export const getCollectionData = (name) => api.get(`/api/collection/${encodeURIComponent(name)}`);
export const deleteItem = (col, id) => api.delete(`/api/collection/${encodeURIComponent(col)}/${encodeURIComponent(id)}`);
export const updateRecord = (formData) => api.post('/api/update_record', formData);
export const extractPdf = (formData) => api.post('/extract', formData);
export const saveRecord = (formData) => api.post('/save', formData);

export default api;
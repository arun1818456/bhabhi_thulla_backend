import express from 'express';
import auth from '../../middleWare/authWare.js';
const router = express.Router();
import { getNotifications ,deleteNotifications , deleteAllNotifications} from './controller.js';

router.get('/notifications', auth, getNotifications);
router.delete('/deleteAll', auth, deleteAllNotifications);
router.delete('/delete/:id', auth, deleteNotifications);
export default router;

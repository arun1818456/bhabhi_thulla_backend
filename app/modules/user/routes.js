import express from 'express';
// import auth from "../../middleWare/authWare.js";
import {
	guestLogin,
	sendRequest,
	acceptRequest,
	rejectRequest,
	cancelRequest,
	getRequests,
	getFriends,
} from './controller.js';

const router = express.Router();

router.post("/guest",guestLogin);
router.post("/sendRequest",sendRequest);
router.post("/acceptRequest",acceptRequest);
router.post("/rejectRequest",rejectRequest);
router.post("/cancelRequest",cancelRequest);
router.get("/requests",getRequests);
router.get("/friends",getFriends);

export default router;    

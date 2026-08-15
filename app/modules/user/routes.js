import express from 'express';
// import auth from "../../middleWare/authWare.js";
import {guestLogin } from './controller.js';

const router = express.Router();

router.post("/guest",guestLogin);
export default router;    

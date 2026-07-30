import express from "express"
import {
    createUser,
    loginUser,
    refreshTokenController,
    logoutController
} from "../controller/authController.js"

const router = express.Router()

router.post("/userSignUp", createUser)
router.post("/userLogin", loginUser)
router.post('/refreshToken', refreshTokenController);
router.post('/logout', logoutController);


export default router
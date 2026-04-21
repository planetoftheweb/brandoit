import * as admin from "firebase-admin";

admin.initializeApp();

export { setAdminRole, deleteUserAccount } from "./admin";

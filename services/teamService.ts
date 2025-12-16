import { db } from "./firebase";
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs,
  query, 
  where,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { Team, User } from "../types";

const TEAMS_COLLECTION = "teams";

export const teamService = {
  
  createTeam: async (name: string, owner: User): Promise<Team> => {
    try {
      const newTeam = {
        name,
        ownerId: owner.id,
        members: [owner.id], // Owner is automatically a member
        createdAt: Date.now()
      };

      const docRef = await addDoc(collection(db, TEAMS_COLLECTION), newTeam);
      
      // Update user to include this team ID (optional, for faster lookups)
      // Ideally we check permissions via 'members' array in rules, but client-side it helps
      // For now, we rely on querying teams where members contains userId
      
      return { ...newTeam, id: docRef.id };
    } catch (error: any) {
      console.error("Error creating team:", error);
      throw new Error(error.message || "Failed to create team.");
    }
  },

  getUserTeams: async (userId: string): Promise<Team[]> => {
    try {
      const q = query(
        collection(db, TEAMS_COLLECTION), 
        where("members", "array-contains", userId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Team));
    } catch (error) {
      console.error("Error fetching user teams:", error);
      return [];
    }
  },

  addMember: async (teamId: string, email: string): Promise<void> => {
    // This is tricky without a backend function because we need to look up userId by email
    // Firestore rules usually prevent listing all users.
    // For this prototype, we'll assume we can find the user if they exist in a public 'users' list 
    // OR we just add their email to an 'invites' array. 
    // To keep it simple: We'll query the users collection by email.
    // NOTE: Requires Firestore index on 'email' and appropriate rules.
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error("User with this email not found.");
      }

      const userToAdd = snapshot.docs[0];
      const teamRef = doc(db, TEAMS_COLLECTION, teamId);
      
      await updateDoc(teamRef, {
        members: arrayUnion(userToAdd.id)
      });

    } catch (error: any) {
      console.error("Error adding member:", error);
      throw error;
    }
  },

  removeMember: async (teamId: string, userId: string): Promise<void> => {
    try {
      const teamRef = doc(db, TEAMS_COLLECTION, teamId);
      await updateDoc(teamRef, {
        members: arrayRemove(userId)
      });
    } catch (error) {
      console.error("Error removing member:", error);
      throw error;
    }
  }
};



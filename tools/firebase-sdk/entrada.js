// Solo lo que usa Forjar. Para actualizar el SDK: cambia la versión en
// package.json y ejecuta `npm install && npm run build` en esta carpeta.
export { initializeApp } from 'firebase/app';
export {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, getDocs, setDoc, deleteDoc, writeBatch, terminate, clearIndexedDbPersistence
} from 'firebase/firestore';

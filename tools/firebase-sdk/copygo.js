// Solo lo que usa CopyGo. Se genera con `npm run build` en esta carpeta.
export { initializeApp } from 'firebase/app';
export {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, query, orderBy, limit, onSnapshot, setDoc, deleteDoc, terminate, clearIndexedDbPersistence
} from 'firebase/firestore';
export {
  getStorage, connectStorageEmulator, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'firebase/storage';

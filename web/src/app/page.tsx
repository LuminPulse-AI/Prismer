import { redirect } from 'next/navigation';

/**
 * Home page - redirects to the default Workspace
 */
export default function Home() {
  redirect('/workspace');
}

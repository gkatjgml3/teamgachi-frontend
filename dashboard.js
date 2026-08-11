import { supabase } from './supabase-client.js';

const profileNameElements = document.querySelectorAll('[data-profile-name]');
const profileRoleElements = document.querySelectorAll('[data-profile-role]');
const welcomeNameElements = document.querySelectorAll('[data-welcome-name]');
const logoutElement = document.querySelector('[data-logout]');

async function logout() {
  await supabase.auth.signOut();
  window.location.replace('./login.html');
}

async function initialize() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    window.location.replace('./login.html');
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = profile?.display_name
    || user.user_metadata?.display_name
    || user.email?.split('@')[0]
    || '팀원';

  profileNameElements.forEach((element) => {
    element.textContent = displayName;
  });
  profileRoleElements.forEach((element) => {
    element.textContent = user.email ?? '팀원';
  });
  welcomeNameElements.forEach((element) => {
    element.textContent = displayName;
  });

  window.lucide?.createIcons();
}

logoutElement?.addEventListener('click', logout);
logoutElement?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    logout();
  }
});

initialize();

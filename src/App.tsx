import './styles/globals.css';
import { MainLayout } from './components/layout/MainLayout';
import { WizardProvider } from './hooks/WizardProvider';
import { SettingsProvider } from './hooks/useSettings';
import { TerminalLogProvider } from './hooks/useTerminalLog';

function App() {
  return (
    <WizardProvider>
      <SettingsProvider>
        <TerminalLogProvider>
          <MainLayout />
        </TerminalLogProvider>
      </SettingsProvider>
    </WizardProvider>
  );
}

export default App;

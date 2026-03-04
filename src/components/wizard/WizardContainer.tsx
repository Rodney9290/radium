import { useState, useEffect } from 'react';
import { ConnectStep } from './ConnectStep';
import { ScanStep } from './ScanStep';
import { BlankStep } from './BlankStep';
import { WriteStep } from './WriteStep';
import { VerifyStep } from './VerifyStep';
import { CompleteStep } from './CompleteStep';
import { ErrorStep } from './ErrorStep';
import { FirmwareUpdateStep } from './FirmwareUpdateStep';
import { HfProcessStep } from './HfProcessStep';
import { HfDumpReadyStep } from './HfDumpReadyStep';
import { PermissionFixStep } from './PermissionFixStep';
import { useWizard } from '../../hooks/useWizard';
import { checkDevicePermissions } from '../../lib/api';
import type { PermissionCheck } from '../../lib/api';

export function WizardContainer() {
  const wizard = useWizard();
  const [permCheck, setPermCheck] = useState<PermissionCheck | null>(null);

  // When detection fails, check Linux permissions to see if that's the cause
  useEffect(() => {
    if (wizard.currentStep === 'Error' && wizard.context.errorSource === 'detect') {
      checkDevicePermissions().then((check) => {
        if (!check.hasPermission) {
          setPermCheck(check);
        }
      }).catch(() => {
        // Permission check itself failed — just show normal error
      });
    } else {
      setPermCheck(null);
    }
  }, [wizard.currentStep, wizard.context.errorSource]);

  const renderStep = () => {
    switch (wizard.currentStep) {
      case 'Idle':
        return <ConnectStep onConnected={wizard.detect} isLoading={false} />;
      case 'DetectingDevice':
        return <ConnectStep onConnected={wizard.detect} isLoading={true} />;
      case 'CheckingFirmware':
        return (
          <FirmwareUpdateStep
            step="CheckingFirmware"
            onUpdate={() => {}}
            onSkip={() => {}}
            onCancel={() => {}}
          />
        );
      case 'FirmwareOutdated':
        return (
          <FirmwareUpdateStep
            step="FirmwareOutdated"
            clientVersion={wizard.context.clientVersion}
            deviceFirmwareVersion={wizard.context.deviceFirmwareVersion}
            hardwareVariant={wizard.context.hardwareVariant}
            firmwarePathExists={wizard.context.firmwarePathExists}
            onUpdate={wizard.updateFirmware}
            onSkip={wizard.skipFirmware}
            onCancel={() => {}}
            onSelectVariant={wizard.selectVariant}
          />
        );
      case 'UpdatingFirmware':
        return (
          <FirmwareUpdateStep
            step="UpdatingFirmware"
            firmwareProgress={wizard.context.firmwareProgress}
            firmwareMessage={wizard.context.firmwareMessage}
            onUpdate={() => {}}
            onSkip={() => {}}
            onCancel={wizard.cancelFirmware}
          />
        );
      case 'RedetectingDevice':
        return (
          <FirmwareUpdateStep
            step="RedetectingDevice"
            onUpdate={() => {}}
            onSkip={() => {}}
            onCancel={() => {}}
          />
        );
      case 'DeviceConnected':
        return (
          <ScanStep
            device={{
              model: wizard.context.model ?? 'Unknown',
              port: wizard.context.port ?? '',
              firmware: wizard.context.firmware ?? 'Unknown',
            }}
            onScanned={wizard.scan}
            isLoading={false}
          />
        );
      case 'ScanningCard':
        return (
          <ScanStep
            device={{
              model: wizard.context.model ?? 'Unknown',
              port: wizard.context.port ?? '',
              firmware: wizard.context.firmware ?? 'Unknown',
            }}
            onScanned={wizard.scan}
            isLoading={true}
          />
        );
      case 'CardIdentified': {
        const isHf = wizard.context.frequency === 'HF';
        return (
          <ScanStep
            device={{
              model: wizard.context.model ?? 'Unknown',
              port: wizard.context.port ?? '',
              firmware: wizard.context.firmware ?? 'Unknown',
            }}
            cardData={wizard.context.cardData}
            cardType={wizard.context.cardType}
            frequency={wizard.context.frequency}
            cloneable={wizard.context.cloneable}
            skipSwapConfirm={isHf}
            onScanned={isHf
              ? () => wizard.startHfProcess()
              : () => wizard.skipToBlank(wizard.context.recommendedBlank!)
            }
            onBack={wizard.backToScan}
            onSave={async (name: string) => {
              const { saveCard } = await import('../../lib/api');
              await saveCard({
                name,
                cardType: wizard.context.cardType ?? '',
                frequency: wizard.context.frequency ?? '',
                uid: wizard.context.cardData?.uid ?? '',
                raw: wizard.context.cardData?.raw ?? '',
                decoded: JSON.stringify(wizard.context.cardData?.decoded ?? {}),
                cloneable: wizard.context.cloneable,
                recommendedBlank: wizard.context.recommendedBlank ?? '',
                createdAt: new Date().toISOString(),
              });
            }}
            isLoading={false}
          />
        );
      }
      case 'HfProcessing':
        return (
          <HfProcessStep
            cardType={wizard.context.cardType}
            phase={wizard.context.hfPhase}
            keysFound={wizard.context.hfKeysFound}
            keysTotal={wizard.context.hfKeysTotal}
            elapsed={wizard.context.hfElapsed}
            onCancel={wizard.cancelHf}
          />
        );
      case 'HfDumpReady':
        return (
          <HfDumpReadyStep
            dumpInfo={wizard.context.hfDumpInfo}
            keysFound={wizard.context.hfKeysFound}
            keysTotal={wizard.context.hfKeysTotal}
            recommendedBlank={wizard.context.recommendedBlank}
            onWriteToBlank={(blank) => wizard.skipToBlank(blank)}
            onBack={wizard.backToScan}
          />
        );
      case 'WaitingForBlank':
        return (
          <BlankStep
            expectedBlank={wizard.context.expectedBlank}
            isLoading={true}
            onReady={() => {}}
            onReset={wizard.reset}
            frequency={wizard.context.frequency}
          />
        );
      case 'BlankDetected':
        return (
          <BlankStep
            expectedBlank={wizard.context.expectedBlank}
            blankType={wizard.context.blankType}
            readyToWrite={wizard.context.readyToWrite}
            existingData={wizard.context.blankExistingData}
            isLoading={false}
            onReady={wizard.write}
            onBack={wizard.backToScan}
            frequency={wizard.context.frequency}
            onErase={async () => {
              const port = wizard.context.port;
              const blankType = wizard.context.blankType;
              if (!port || !blankType) return;
              const { wipeChip } = await import('../../lib/api');
              await wipeChip(port, blankType);
              await wizard.reDetectBlank();
            }}
          />
        );
      case 'Writing':
        return (
          <WriteStep
            progress={wizard.context.writeProgress}
            currentBlock={wizard.context.currentBlock}
            totalBlocks={wizard.context.totalBlocks}
            cardType={wizard.context.cardType}
            blankType={wizard.context.blankType}
            isLoading={true}
          />
        );
      case 'Verifying':
        return (
          <VerifyStep
            isLoading={true}
            onContinue={() => {}}
            onReset={wizard.reset}
          />
        );
      case 'VerificationComplete':
        return (
          <VerifyStep
            success={wizard.context.verifySuccess}
            mismatchedBlocks={wizard.context.mismatchedBlocks}
            isLoading={false}
            onContinue={wizard.finish}
            onRetryWrite={wizard.reset}
            onReset={wizard.reset}
          />
        );
      case 'Complete':
        return (
          <CompleteStep
            cardType={wizard.context.cardType}
            cardData={wizard.context.cardData}
            timestamp={wizard.context.completionTimestamp}
            onReset={wizard.softReset}
            onDisconnect={wizard.disconnect}
          />
        );
      case 'Error':
        // Show Linux permission fix UI when detection failed due to permissions
        if (permCheck && wizard.context.errorSource === 'detect') {
          return (
            <PermissionFixStep
              check={permCheck}
              onRetry={async () => {
                setPermCheck(null);
                await wizard.reset();
                // Small delay to let XState settle into idle before detecting
                setTimeout(() => wizard.detect(), 50);
              }}
              onDismiss={() => setPermCheck(null)}
            />
          );
        }
        return (
          <ErrorStep
            message={wizard.context.errorUserMessage}
            recoverable={wizard.context.errorRecoverable}
            recoveryAction={wizard.context.errorRecoveryAction}
            errorSource={wizard.context.errorSource}
            onRetry={wizard.reset}
            onReset={wizard.reset}
          />
        );
      default:
        return (
          <div style={{
            color: 'var(--error)',
            fontSize: '13px',
            padding: 'var(--space-6)',
            fontFamily: 'var(--font-mono)',
          }}>
            Unknown state: {wizard.currentStep}
          </div>
        );
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      {renderStep()}
    </div>
  );
}

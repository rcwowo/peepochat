import { SettingsTab, SettingsDivider, SettingsCallout } from "@/components/settings/settings-primitives"

export function HighlightsTab() {
  return (
    <SettingsTab
      title="Highlights"
      description="Highlight rules and visual emphasis for messages that matter to you."
    >

    <SettingsDivider />

    <SettingsCallout title="Not implemented yet">
      This feature has not been implemented yet. In the future, it'll allow you to:
      <ul className="list-disc list-inside">
        <li>Get notified when a message matches a highlight rule.</li>
        <li>See when a chat has unread messages when not in view.</li>
        <li>Get notified when a channel goes live.</li>
      </ul>
    </SettingsCallout>
  </SettingsTab>
  );
}

export const ReplTabButtons = (props: ReplTabButtonsProps) => {
  return (
    <div class="repl-tab-buttons" translate="no">
      <div class="repl-tab-buttons-inner">{props.children}</div>
    </div>
  );
};

interface ReplTabButtonsProps {
  children: any;
}

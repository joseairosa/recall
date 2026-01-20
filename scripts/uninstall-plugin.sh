#!/bin/bash
# uninstall-plugin.sh - Recall Plugin Uninstaller for Claude Code
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/joseairosa/recall/main/scripts/uninstall-plugin.sh | bash
#
# This script:
#   - Removes the Recall plugin from Claude Code
#   - Optionally removes the MCP server configuration from settings.json
#   - Cleans up backup files

set -e

# Configuration
PLUGIN_DIR="$HOME/.claude/plugins/recall-rlm"
SETTINGS_FILE="$HOME/.claude/settings.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${RED}  Recall Plugin Uninstaller${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}!${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_info() {
  echo -e "${BLUE}→${NC} $1"
}

# Ask for confirmation
confirm() {
  local prompt="$1"
  local response

  echo -n -e "${YELLOW}?${NC} $prompt [y/N] "
  read -r response

  case "$response" in
    [yY][eE][sS]|[yY])
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Remove plugin directory
remove_plugin() {
  if [ -d "$PLUGIN_DIR" ]; then
    print_info "Removing plugin directory: $PLUGIN_DIR"
    rm -rf "$PLUGIN_DIR"
    print_success "Plugin directory removed"
  else
    print_warning "Plugin directory not found (already removed?)"
  fi
}

# Remove backup directories
remove_backups() {
  local backups
  backups=$(ls -d "$HOME/.claude/plugins/recall-rlm.backup."* 2>/dev/null || echo "")

  if [ -n "$backups" ]; then
    echo ""
    print_info "Found backup directories:"
    echo "$backups" | while read -r dir; do
      echo "  - $dir"
    done
    echo ""

    if confirm "Remove backup directories?"; then
      echo "$backups" | while read -r dir; do
        rm -rf "$dir"
      done
      print_success "Backup directories removed"
    else
      print_info "Keeping backup directories"
    fi
  fi
}

# Remove MCP configuration from settings.json
remove_settings() {
  if [ ! -f "$SETTINGS_FILE" ]; then
    print_warning "Settings file not found"
    return
  fi

  if ! grep -q '"recall"' "$SETTINGS_FILE" 2>/dev/null; then
    print_warning "Recall not found in settings (already removed?)"
    return
  fi

  echo ""
  if confirm "Remove Recall from settings.json?"; then
    if command -v jq &> /dev/null; then
      # Use jq for clean removal
      cp "$SETTINGS_FILE" "${SETTINGS_FILE}.pre-uninstall"
      jq 'del(.mcpServers.recall)' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
      print_success "Removed Recall from settings.json"
      print_info "Backup saved to ${SETTINGS_FILE}.pre-uninstall"
    else
      print_warning "jq not installed - cannot auto-remove from settings"
      echo ""
      echo "Please manually remove the 'recall' entry from mcpServers in:"
      echo "  $SETTINGS_FILE"
    fi
  else
    print_info "Keeping Recall configuration in settings.json"
  fi
}

# Print completion message
print_completion() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Uninstallation Complete${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo "The Recall plugin has been removed."
  echo ""
  echo "If you had the RECALL_API_KEY environment variable set,"
  echo "you may want to remove it from your shell profile."
  echo ""
  echo -e "${BLUE}To reinstall:${NC}"
  echo "  curl -fsSL https://raw.githubusercontent.com/joseairosa/recall/main/scripts/install-plugin.sh | bash"
  echo ""
}

# Main uninstallation flow
main() {
  print_header

  # Check if anything to uninstall
  if [ ! -d "$PLUGIN_DIR" ] && ! grep -q '"recall"' "$SETTINGS_FILE" 2>/dev/null; then
    print_warning "Recall plugin does not appear to be installed"
    exit 0
  fi

  # Confirm uninstallation
  if ! confirm "Uninstall Recall plugin?"; then
    print_info "Uninstallation cancelled"
    exit 0
  fi

  echo ""

  # Remove plugin
  remove_plugin

  # Remove backups
  remove_backups

  # Remove settings
  remove_settings

  print_completion
}

# Run main
main "$@"

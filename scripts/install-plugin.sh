#!/bin/bash
# install-plugin.sh - Recall Plugin Installer for Claude Code
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/joseairosa/recall/main/scripts/install-plugin.sh | bash

set -e

# Configuration
REPO="joseairosa/recall"
BRANCH="feature/1768545187-saas-http-server"  # TODO: Change to "main" before merging
PLUGIN_DIR="$HOME/.claude/plugins/recall-rlm"
SETTINGS_FILE="$HOME/.claude/settings.json"
VERSION_FILE="$PLUGIN_DIR/.version"
TEMP_DIR=$(mktemp -d)

# Colors
BLACK='\033[0;30m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
BOLD='\033[1m'
DIM='\033[2m'
ITALIC='\033[3m'
UNDERLINE='\033[4m'
NC='\033[0m'

# Box drawing characters
BOX_TL='╭'
BOX_TR='╮'
BOX_BL='╰'
BOX_BR='╯'
BOX_H='─'
BOX_V='│'

# Cleanup on exit
cleanup() {
  rm -rf "$TEMP_DIR"
  tput cnorm > /dev/tty 2>/dev/null || true  # Show cursor
}
trap cleanup EXIT

# Hide cursor during installation
tput civis > /dev/tty 2>/dev/null || true

# Utility functions
repeat_char() {
  local char="$1"
  local count="$2"
  printf "%${count}s" | tr ' ' "$char"
}

center_text() {
  local text="$1"
  local width="$2"
  local text_len=${#text}
  local padding=$(( (width - text_len) / 2 ))
  printf "%${padding}s%s%${padding}s" "" "$text" ""
}

# Spinner animation
spinner() {
  local pid=$1
  local message="$2"
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0

  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i + 1) % 10 ))
    printf "\r  ${CYAN}${spin:$i:1}${NC} %s" "$message"
    sleep 0.1
  done
  printf "\r"
}

# Progress bar
progress_bar() {
  local current="$1"
  local total="$2"
  local width=30
  local percentage=$((current * 100 / total))
  local filled=$((current * width / total))
  local empty=$((width - filled))

  printf "  ${GRAY}[${NC}"
  printf "${GREEN}%s${NC}" "$(repeat_char '█' $filled)"
  printf "${GRAY}%s${NC}" "$(repeat_char '░' $empty)"
  printf "${GRAY}]${NC} ${WHITE}%3d%%${NC}" "$percentage"
}

# Print functions
print_header() {
  clear
  echo ""
  echo -e "${CYAN}"
  cat << 'EOF'
    ____                 ____
   / __ \___  _________ / / /
  / /_/ / _ \/ ___/ __ `/ / /
 / _, _/  __/ /__/ /_/ / / /
/_/ |_|\___/\___/\__,_/_/_/

EOF
  echo -e "${NC}"
  echo -e "  ${GRAY}Plugin Installer for Claude Code${NC}"
  echo -e "  ${DIM}──────────────────────────────────${NC}"
  echo ""
}

print_box() {
  local title="$1"
  local width=50

  echo -e "  ${CYAN}${BOX_TL}$(repeat_char "$BOX_H" $((width-2)))${BOX_TR}${NC}"
  echo -e "  ${CYAN}${BOX_V}${NC}$(center_text "$title" $((width-2)))${CYAN}${BOX_V}${NC}"
  echo -e "  ${CYAN}${BOX_BL}$(repeat_char "$BOX_H" $((width-2)))${BOX_BR}${NC}"
}

print_success() {
  echo -e "  ${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "  ${RED}✗${NC} $1"
}

print_info() {
  echo -e "  ${BLUE}→${NC} $1"
}

print_step() {
  echo ""
  echo -e "  ${WHITE}${BOLD}$1${NC}"
  echo -e "  ${GRAY}$(repeat_char '─' 40)${NC}"
  echo ""
}

print_option() {
  local num="$1"
  local title="$2"
  local desc="$3"
  local color="$4"

  echo -e "    ${WHITE}${BOLD}${num}${NC}  ${color}●${NC} ${WHITE}${title}${NC}"
  echo -e "       ${GRAY}${desc}${NC}"
  echo ""
}

# Interactive prompts - read from /dev/tty to work with curl | bash
prompt_choice() {
  local prompt="$1"
  local default="$2"
  local response

  echo -n -e "  ${MAGENTA}❯${NC} ${WHITE}$prompt${NC} ${GRAY}[$default]${NC}: " > /dev/tty
  tput cnorm > /dev/tty 2>/dev/null || true
  read -r response < /dev/tty
  tput civis > /dev/tty 2>/dev/null || true

  echo "${response:-$default}"
}

prompt_secret() {
  local prompt="$1"
  local response

  echo -n -e "  ${MAGENTA}❯${NC} ${WHITE}$prompt${NC}: " > /dev/tty
  tput cnorm > /dev/tty 2>/dev/null || true
  IFS= read -rs response < /dev/tty
  tput civis > /dev/tty 2>/dev/null || true
  echo "" > /dev/tty

  # Trim whitespace
  response="${response#"${response%%[![:space:]]*}"}"
  response="${response%"${response##*[![:space:]]}"}"

  echo "$response"
}

prompt_confirm() {
  local prompt="$1"
  local default="${2:-n}"
  local response

  if [ "$default" = "y" ]; then
    echo -n -e "  ${MAGENTA}❯${NC} ${WHITE}$prompt${NC} ${GRAY}[Y/n]${NC}: " > /dev/tty
  else
    echo -n -e "  ${MAGENTA}❯${NC} ${WHITE}$prompt${NC} ${GRAY}[y/N]${NC}: " > /dev/tty
  fi

  tput cnorm > /dev/tty 2>/dev/null || true
  read -r response < /dev/tty
  tput civis > /dev/tty 2>/dev/null || true

  case "${response:-$default}" in
    [yY][eE][sS]|[yY]) return 0 ;;
    *) return 1 ;;
  esac
}

# Check dependencies
check_dependencies() {
  local missing=()

  command -v curl &> /dev/null || missing+=("curl")
  command -v tar &> /dev/null || missing+=("tar")

  if [ ${#missing[@]} -gt 0 ]; then
    print_error "Missing required commands: ${missing[*]}"
    exit 1
  fi
}

# Version management
get_latest_version() {
  local version
  version=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' || echo "")

  if [ -z "$version" ]; then
    version=$(curl -s "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null | grep '"sha"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/' | cut -c1-7 || echo "$BRANCH")
  fi

  echo "${version:-$BRANCH}"
}

get_current_version() {
  [ -f "$VERSION_FILE" ] && cat "$VERSION_FILE" || echo ""
}

# Setup wizard
run_setup_wizard() {
  print_step "Choose Your Setup"

  print_option "1" "Recall Cloud" "Easiest setup • No Redis required • recallmcp.com" "$GREEN"
  print_option "2" "Self-Hosted" "Full control • Requires Redis • Local or remote" "$BLUE"

  local choice
  choice=$(prompt_choice "Select option" "1")

  case "$choice" in
    1|cloud|Cloud) setup_cloud ;;
    2|local|self-hosted|selfhosted|redis) setup_selfhosted ;;
    *) print_warning "Invalid choice, using Cloud"; setup_cloud ;;
  esac
}

setup_cloud() {
  SETUP_TYPE="cloud"

  print_step "Recall Cloud Configuration"

  echo -e "  ${GRAY}Get your API key from ${UNDERLINE}https://recallmcp.com${NC}"
  echo ""

  local api_key
  api_key=$(prompt_secret "Enter API key (or Enter to skip)")

  if [ -z "$api_key" ]; then
    print_warning "No key provided • Set RECALL_API_KEY later"
    API_KEY=""
  else
    # Basic validation - just check it has reasonable length
    if [ ${#api_key} -lt 10 ]; then
      print_warning "Key seems too short (${#api_key} chars)"
      if ! prompt_confirm "Use anyway?"; then
        api_key=""
      fi
    fi

    if [ -n "$api_key" ]; then
      API_KEY="$api_key"
      # Show masked key for confirmation
      local masked="${api_key:0:8}...${api_key: -4}"
      print_success "API key configured ($masked)"

      echo ""
      if prompt_confirm "Save to shell profile (~/.zshrc)?"; then
        ADD_TO_PROFILE="yes"
      else
        ADD_TO_PROFILE="no"
      fi
    else
      API_KEY=""
    fi
  fi
}

setup_selfhosted() {
  SETUP_TYPE="selfhosted"

  print_step "Self-Hosted Configuration"

  echo -e "  ${GRAY}Configure your Redis connection${NC}"
  echo ""

  local redis_host redis_port redis_password

  redis_host=$(prompt_choice "Redis host" "localhost")
  redis_port=$(prompt_choice "Redis port" "6379")

  echo ""
  if prompt_confirm "Authentication required?"; then
    redis_password=$(prompt_secret "Redis password")
  else
    redis_password=""
  fi

  # Build URL
  if [ -n "$redis_password" ]; then
    REDIS_URL="redis://:${redis_password}@${redis_host}:${redis_port}"
  else
    REDIS_URL="redis://${redis_host}:${redis_port}"
  fi

  echo ""
  if prompt_confirm "Use TLS/SSL?"; then
    REDIS_URL="${REDIS_URL/redis:/rediss:}"
  fi

  echo ""
  echo -e "  ${GRAY}Connection:${NC} ${CYAN}$REDIS_URL${NC}"

  # Test connection
  echo ""
  if command -v redis-cli &> /dev/null; then
    echo -ne "  ${CYAN}⠋${NC} Testing connection..."
    if redis-cli -u "$REDIS_URL" ping &> /dev/null; then
      echo -e "\r  ${GREEN}✓${NC} Connection successful    "
    else
      echo -e "\r  ${YELLOW}⚠${NC} Connection failed       "
      prompt_confirm "Continue anyway?" || exit 1
    fi
  else
    print_info "redis-cli not found • Skipping test"
  fi
}

# Installation
download_plugin() {
  echo -e "  ${CYAN}⠋${NC} Downloading from GitHub..."

  # Download archive
  local download_url="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"
  if ! curl -fsSL "$download_url" -o "$TEMP_DIR/plugin.tar.gz" 2>"$TEMP_DIR/curl_error.log"; then
    echo -e "  ${RED}✗${NC} Failed to download from GitHub"
    [ -f "$TEMP_DIR/curl_error.log" ] && cat "$TEMP_DIR/curl_error.log" > /dev/tty
    exit 1
  fi

  # Extract archive
  echo -e "  ${CYAN}⠙${NC} Extracting..."
  if ! tar -xzf "$TEMP_DIR/plugin.tar.gz" -C "$TEMP_DIR" 2>"$TEMP_DIR/tar_error.log"; then
    echo -e "  ${RED}✗${NC} Failed to extract archive"
    [ -f "$TEMP_DIR/tar_error.log" ] && cat "$TEMP_DIR/tar_error.log" > /dev/tty
    exit 1
  fi

  # Find extracted directory (name based on repo and branch, e.g., recall-main or recall-feature-xxx)
  local extracted_dir
  extracted_dir=$(ls -d "$TEMP_DIR"/recall-* 2>/dev/null | head -1)

  if [ -z "$extracted_dir" ]; then
    echo -e "  ${RED}✗${NC} Could not find extracted directory"
    echo "  Contents of temp dir:" > /dev/tty
    ls -la "$TEMP_DIR" > /dev/tty
    exit 1
  fi

  if [ ! -d "$extracted_dir/claude-plugin" ]; then
    echo -e "  ${RED}✗${NC} Plugin directory not found in archive"
    echo "  Expected: $extracted_dir/claude-plugin" > /dev/tty
    echo "  Contents:" > /dev/tty
    ls -la "$extracted_dir" > /dev/tty
    exit 1
  fi

  # Copy plugin files (including hidden directories like .claude-plugin)
  mkdir -p "$PLUGIN_DIR"
  cp -r "$extracted_dir/claude-plugin/"* "$PLUGIN_DIR/"
  cp -r "$extracted_dir/claude-plugin/".* "$PLUGIN_DIR/" 2>/dev/null || true

  echo -e "  ${GREEN}✓${NC} Downloaded and extracted"
}

backup_existing() {
  if [ -d "$PLUGIN_DIR" ]; then
    local backup_dir="${PLUGIN_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    mv "$PLUGIN_DIR" "$backup_dir"
    print_info "Backed up previous installation"
  fi
}

configure_settings() {
  mkdir -p "$(dirname "$SETTINGS_FILE")"

  local new_config
  if [ "$SETUP_TYPE" = "cloud" ]; then
    if [ -n "$API_KEY" ]; then
      new_config="{\"url\":\"https://recallmcp.com/mcp\",\"headers\":{\"Authorization\":\"Bearer $API_KEY\"}}"
    else
      new_config='{"url":"https://recallmcp.com/mcp","headers":{"Authorization":"Bearer ${RECALL_API_KEY}"}}'
    fi
  else
    new_config="{\"command\":\"npx\",\"args\":[\"-y\",\"@joseairosa/recall\"],\"env\":{\"REDIS_URL\":\"$REDIS_URL\"}}"
  fi

  if [ -f "$SETTINGS_FILE" ]; then
    cp "$SETTINGS_FILE" "${SETTINGS_FILE}.backup"

    if grep -q '"recall"' "$SETTINGS_FILE" 2>/dev/null; then
      if prompt_confirm "Overwrite existing Recall config?"; then
        if command -v jq &> /dev/null; then
          jq --argjson config "$new_config" '.mcpServers.recall = $config | .mcpToolsSearchAuto = "auto:5"' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp"
          mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        else
          print_warning "Install jq for automatic config • Manual edit needed"
        fi
      fi
    else
      if command -v jq &> /dev/null; then
        jq --argjson config "$new_config" '.mcpServers = (.mcpServers // {}) | .mcpServers.recall = $config | .mcpToolsSearchAuto = "auto:5"' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp"
        mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
      else
        print_warning "Install jq for automatic config"
      fi
    fi
  else
    if [ "$SETUP_TYPE" = "cloud" ]; then
      if [ -n "$API_KEY" ]; then
        cat > "$SETTINGS_FILE" << EOF
{
  "mcpToolsSearchAuto": "auto:5",
  "mcpServers": {
    "recall": {
      "url": "https://recallmcp.com/mcp",
      "headers": {
        "Authorization": "Bearer $API_KEY"
      }
    }
  }
}
EOF
      else
        cat > "$SETTINGS_FILE" << 'EOF'
{
  "mcpToolsSearchAuto": "auto:5",
  "mcpServers": {
    "recall": {
      "url": "https://recallmcp.com/mcp",
      "headers": {
        "Authorization": "Bearer ${RECALL_API_KEY}"
      }
    }
  }
}
EOF
      fi
    else
      cat > "$SETTINGS_FILE" << EOF
{
  "mcpToolsSearchAuto": "auto:5",
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": ["-y", "@joseairosa/recall"],
      "env": {
        "REDIS_URL": "$REDIS_URL"
      }
    }
  }
}
EOF
    fi
  fi

  print_success "Settings configured"
}

register_plugin() {
  local installed_plugins_file="$HOME/.claude/plugins/installed_plugins.json"

  if [ -f "$installed_plugins_file" ]; then
    if command -v jq &> /dev/null; then
      jq --arg path "$PLUGIN_DIR" '.plugins["recall-rlm"] = {"source": "local", "installLocation": $path}' "$installed_plugins_file" > "${installed_plugins_file}.tmp"
      mv "${installed_plugins_file}.tmp" "$installed_plugins_file"
    else
      # Fallback without jq
      cat > "$installed_plugins_file" << EOF
{
  "version": 2,
  "plugins": {
    "recall-rlm": {
      "source": "local",
      "installLocation": "$PLUGIN_DIR"
    }
  }
}
EOF
    fi
  else
    cat > "$installed_plugins_file" << EOF
{
  "version": 2,
  "plugins": {
    "recall-rlm": {
      "source": "local",
      "installLocation": "$PLUGIN_DIR"
    }
  }
}
EOF
  fi

  print_success "Plugin registered"
}

add_to_profile() {
  if [ "$ADD_TO_PROFILE" = "yes" ] && [ -n "$API_KEY" ]; then
    local profile="$HOME/.zshrc"
    [ -f "$HOME/.bashrc" ] && [ -n "$BASH_VERSION" ] && profile="$HOME/.bashrc"

    if ! grep -q "RECALL_API_KEY" "$profile" 2>/dev/null; then
      echo -e "\n# Recall API Key\nexport RECALL_API_KEY=\"$API_KEY\"" >> "$profile"
      print_success "Added to $profile"
    fi
  fi
}

save_version() {
  echo "$1" > "$VERSION_FILE"
}

print_completion() {
  echo ""
  echo -e "  ${GREEN}╭──────────────────────────────────────────╮${NC}"
  echo -e "  ${GREEN}│${NC}   ${WHITE}${BOLD}✓ Installation Complete!${NC}              ${GREEN}│${NC}"
  echo -e "  ${GREEN}╰──────────────────────────────────────────╯${NC}"
  echo ""

  if [ "$SETUP_TYPE" = "cloud" ]; then
    echo -e "  ${GRAY}Setup:${NC}     ${GREEN}●${NC} Recall Cloud"
    if [ -z "$API_KEY" ]; then
      echo ""
      echo -e "  ${YELLOW}⚠ Action Required${NC}"
      echo -e "  ${GRAY}├${NC} Get API key: ${UNDERLINE}https://recallmcp.com${NC}"
      echo -e "  ${GRAY}└${NC} Then run: ${CYAN}export RECALL_API_KEY=sk-recall-...${NC}"
    fi
  else
    echo -e "  ${GRAY}Setup:${NC}     ${BLUE}●${NC} Self-Hosted"
    echo -e "  ${GRAY}Redis:${NC}     ${CYAN}$REDIS_URL${NC}"
  fi

  echo ""
  echo -e "  ${WHITE}${BOLD}Optimizations Applied${NC}"
  echo -e "  ${GRAY}└${NC} ${CYAN}mcpToolsSearchAuto: auto:5${NC}"
  echo -e "    ${GRAY}MCP tools deferred until needed • Saves 10-30K tokens${NC}"
  echo ""
  echo -e "  ${WHITE}${BOLD}Next Steps${NC}"
  echo -e "  ${GRAY}├${NC} Restart Claude Code"
  echo -e "  ${GRAY}├${NC} Try: ${CYAN}/load-context <file>${NC}"
  echo -e "  ${GRAY}└${NC} Docs: ${UNDERLINE}https://github.com/$REPO${NC}"
  echo ""
  echo -e "  ${GRAY}Commands: /load-context • /decompose • /rlm-status${NC}"
  echo ""

  tput cnorm > /dev/tty 2>/dev/null || true  # Show cursor
}

# Main
main() {
  print_header
  check_dependencies

  print_info "Checking for updates..."
  local latest_version current_version
  latest_version=$(get_latest_version)
  current_version=$(get_current_version)

  [ -n "$current_version" ] && print_info "Installed: $current_version"
  print_info "Latest: $latest_version"

  if [ "$current_version" = "$latest_version" ] && [ -d "$PLUGIN_DIR" ]; then
    echo ""
    print_success "Already up to date"
    echo ""
    if prompt_confirm "Reconfigure?"; then
      run_setup_wizard
      configure_settings
      add_to_profile
      print_completion
    fi
    exit 0
  fi

  run_setup_wizard

  print_step "Installing"

  backup_existing
  download_plugin
  register_plugin
  save_version "$latest_version"
  configure_settings
  add_to_profile

  print_completion
}

main "$@"

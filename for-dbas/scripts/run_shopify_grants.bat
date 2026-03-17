@echo off
REM ============================================================================
REM Run Shopify Cross-Schema Grants
REM ============================================================================
REM This script runs V069 to grant ATTR_MGR access to MERCH/OMNI/VSTORE schemas
REM 
REM Usage: run_shopify_grants.bat [SYS_PASSWORD] [DB_CONNECTION]
REM Example: run_shopify_grants.bat MyPassword123 100.90.84.20:1521/DEMODB
REM ============================================================================

SET SQLPLUS="C:\oracle\Middleware\Oracle_Forms_Home\bin\sqlplus.exe"
SET SCRIPT_PATH=%~dp0V069__shopify_cross_schema_access.sql

IF "%1"=="" (
    echo.
    echo Usage: run_shopify_grants.bat [SYS_PASSWORD] [DB_CONNECTION]
    echo.
    echo Example: run_shopify_grants.bat MyPassword123 100.90.84.20:1521/DEMODB
    echo.
    SET /P SYS_PWD="Enter SYS password: "
    SET /P DB_CONN="Enter DB connection (e.g., 100.90.84.20:1521/DEMODB): "
) ELSE (
    SET SYS_PWD=%1
    SET DB_CONN=%2
)

IF "%DB_CONN%"=="" SET DB_CONN=100.90.84.20:1521/DEMODB

echo.
echo ============================================================
echo Running Shopify Grants Script
echo Database: %DB_CONN%
echo ============================================================
echo.

%SQLPLUS% -S "sys/%SYS_PWD%@%DB_CONN% as sysdba" @"%SCRIPT_PATH%"

echo.
echo ============================================================
echo Script completed. Check output above for any errors.
echo ============================================================
pause

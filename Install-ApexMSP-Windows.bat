@echo off
title ApexMSP Windows Agent, Connect & Backstage Setup (v2.0.10)
echo ==========================================================
echo   ApexMSP Windows Agent, Connect ^& Backstage Setup
echo ==========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm 'https://api.apexmsp.app/api/v1/installers/windows/tok-de9f94f4-1394-4d' | iex"
pause
